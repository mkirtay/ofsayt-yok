/**
 * Maç paylaşım görseli (1200×630) — `/api/og/match/[id]` çizer. Veri sunucudaki maç kaydından gelir.
 *
 * Düzen (ogTheme: Scor3 siyahı zemin + sağda açık eğik şerit + altta lime şerit):
 * - üst: yeni logo (sol) · durum rozeti (sağ): canlıysa kırmızı "CANLI 67'", devre arası, maç sonu, özel durum
 *   (ertelendi …) ya da başlamamış maçta tarih
 * - turnuva: logo (beyaz zemin — lig logolarının çoğu koyu) + ad
 * - orta: iki takım logosu (beyaz daire) + ad · skor ya da başlama saati (TSİ)
 * Font (Inter) ve marka logosu gömülü; takım / turnuva logoları 1,5 sn zaman aşımıyla çekilir, olmazsa baş harfler.
 */
import { ImageResponse } from './imageResponse';
import type { Match, MatchStateCode } from '@/models/liveScore';
import { TEAM_NAMES } from '@/content/teamNames';
import { matchKickoffMs } from '@/utils/matchActivity';
import { BRAND_LOGO_ASPECT, BRAND_LOGO_DATA_URI, fetchLogoDataUri, ogFonts, teamInitials } from './ogAssets';
import { OG_ACCENT, OG_BG, OG_CHIP, OG_LIVE, OG_TEXT, OG_TEXT_SOFT, OgBackdrop } from './ogTheme';
/** Takım adı bu kadar karakteri aşarsa sözlükteki kısa ad, o da yoksa kesme (32 px Inter 800 ≈ 340 px). */
const NAME_MAX_CHARS = 18;

/** matchState.json `short` ile aynı (paylaşım görseli yalnız Türkçe). */
const STATE_LABELS: Record<MatchStateCode, string> = {
  POSTPONED: 'ERTELENDİ',
  CANCELLED: 'İPTAL',
  DELETED: 'İPTAL',
  ABANDONED: 'YARIDA KALDI',
  TBA: 'TARİH BELLİ DEĞİL',
  DELAYED: 'GECİKTİ',
  SUSPENDED: 'DURDURULDU',
  INTERRUPTED: 'DURDURULDU',
  AWARDED: 'HÜKMEN',
  WALKOVER: 'HÜKMEN',
  PENDING: 'BEKLEMEDE',
};

const kickoffTime = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const kickoffDate = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', weekday: 'long' });

function truncate(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join('')}…`;
}

function displayName(team: Match['home'] | undefined, fallback: string): string {
  const name = team?.name || fallback;
  if ([...name].length <= NAME_MAX_CHARS) return name;
  const short = team?.id ? TEAM_NAMES[team.id]?.shortName : undefined;
  return truncate(short && [...short].length <= NAME_MAX_CHARS ? short : name, NAME_MAX_CHARS);
}

function goals(m: Match): [string, string] | null {
  const g = (m.scores?.score || m.score || '').match(/\d+/g);
  return g && g.length >= 2 ? [g[0]!, g[1]!] : null;
}

export type MatchOgStatus =
  | { kind: 'live'; label: string }
  | { kind: 'badge'; label: string }
  | { kind: 'date'; label: string };

/** Sağ üstteki durum rozeti. */
export function matchOgStatus(m: Match): MatchOgStatus {
  if (m.state_code) return { kind: 'badge', label: STATE_LABELS[m.state_code] ?? m.state_code };
  switch (m.status) {
    case 'IN PLAY': {
      const minute = (m.time || '').match(/\d+/)?.[0];
      return { kind: 'live', label: minute ? `CANLI ${minute}'` : 'CANLI' };
    }
    case 'HALF TIME BREAK':
      return { kind: 'live', label: 'DEVRE ARASI' };
    case 'FINISHED':
      return { kind: 'badge', label: 'MAÇ SONU' };
    default: {
      const k = matchKickoffMs(m);
      return { kind: 'date', label: k == null ? '' : kickoffDate.format(k) };
    }
  }
}

/** Ortadaki büyük metin: skor (ev, deplasman), başlamamışsa TSİ saat ("21:30"), saat yoksa "VS". */
export function matchOgCenter(m: Match): { text: string; score: [string, string] | null } {
  const notStarted = m.status === 'NOT STARTED' && m.state_code !== 'AWARDED' && m.state_code !== 'WALKOVER';
  const g = goals(m);
  if (!notStarted && g) return { text: `${g[0]} – ${g[1]}`, score: g };
  const k = matchKickoffMs(m);
  if (notStarted && k != null && m.state_code !== 'TBA' && m.state_code !== 'POSTPONED') {
    return { text: kickoffTime.format(k), score: null };
  }
  return { text: 'VS', score: null };
}

function LogoOrInitials({ src, name, size, inner }: { src: string | null; name: string; size: number; inner: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size / 2,
        background: src ? '#ffffff' : OG_CHIP,
        color: OG_TEXT,
        fontSize: Math.round(size * 0.34),
        fontWeight: 800,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={inner} height={inner} style={{ objectFit: 'contain' }} alt="" />
      ) : (
        teamInitials(name)
      )}
    </div>
  );
}

function TeamColumn({ logo, name, fullName }: { logo: string | null; name: string; fullName: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 360, gap: 22 }}>
      <LogoOrInitials src={logo} name={fullName} size={168} inner={124} />
      <div style={{ display: 'flex', color: OG_TEXT, fontSize: 32, fontWeight: 800, textAlign: 'center' }}>{name}</div>
    </div>
  );
}

export async function renderMatchOgImage(match: Match): Promise<ImageResponse> {
  const homeFull = match.home?.name || 'Ev Sahibi';
  const awayFull = match.away?.name || 'Deplasman';
  const comp = truncate(match.competition?.name || match.competition_name || 'Maç Detayı', 42);
  const status = matchOgStatus(match);
  const center = matchOgCenter(match);
  const [homeLogo, awayLogo, compLogo] = await Promise.all([
    fetchLogoDataUri(match.home?.logo),
    fetchLogoDataUri(match.away?.logo),
    fetchLogoDataUri(match.competition?.logo),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: OG_BG,
          fontFamily: 'Inter',
          position: 'relative',
        }}
      >
        <OgBackdrop />

        {/* üst: logo · durum */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '40px 56px 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO_DATA_URI} width={Math.round(56 * BRAND_LOGO_ASPECT)} height={56} alt="" />
          {status.label ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 22px',
                borderRadius: 999,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: 0.5,
                color: status.kind === 'live' ? '#fff' : OG_TEXT,
                background: status.kind === 'live' ? OG_LIVE : OG_CHIP,
              }}
            >
              {status.kind === 'live' ? (
                <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: '#fff' }} />
              ) : null}
              {status.kind === 'date' ? status.label.charAt(0).toLocaleUpperCase('tr-TR') + status.label.slice(1) : status.label}
            </div>
          ) : null}
        </div>

        {/* turnuva */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '26px 56px 0' }}>
          {compLogo ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 52,
                borderRadius: 12,
                background: '#ffffff',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={compLogo} width={38} height={38} style={{ objectFit: 'contain' }} alt="" />
            </div>
          ) : null}
          <div style={{ display: 'flex', color: OG_TEXT_SOFT, fontSize: 28, fontWeight: 600 }}>{comp}</div>
        </div>

        {/* orta: takımlar + skor / saat */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '0 40px 24px' }}>
          <TeamColumn logo={homeLogo} name={displayName(match.home, 'Ev Sahibi')} fullName={homeFull} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 300,
              color: OG_TEXT,
              fontSize: center.score ? 112 : center.text === 'VS' ? 56 : 88,
              fontWeight: 800,
              marginTop: -54,
            }}
          >
            {center.score ? (
              <div style={{ display: 'flex', alignItems: 'center', height: 120, lineHeight: 1 }}>
                <div style={{ display: 'flex' }}>{center.score[0]}</div>
                <div style={{ display: 'flex', width: 44, height: 10, borderRadius: 5, background: OG_ACCENT, marginLeft: 30, marginRight: 30 }} />
                <div style={{ display: 'flex' }}>{center.score[1]}</div>
              </div>
            ) : (
              center.text
            )}
          </div>
          <TeamColumn logo={awayLogo} name={displayName(match.away, 'Deplasman')} fullName={awayFull} />
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: ogFonts() },
  );
}
