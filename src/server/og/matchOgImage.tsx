/**
 * Maç paylaşım görseli (1200×630) — `/api/og/match/[id]` çizer. Veri sunucudaki maç kaydından gelir.
 * Font (Inter) ve marka logosu gömülü; takım logoları 1,5 sn zaman aşımıyla çekilir, olmazsa baş harfler.
 */
import { ImageResponse } from 'next/og';
import type { Match } from '@/models/liveScore';
import { BRAND_LOGO_ASPECT, BRAND_LOGO_DATA_URI, fetchLogoDataUri, ogFonts, teamInitials } from './ogAssets';

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';

function truncate(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join('')}…`;
}

function TeamBadge({ logo, name, size }: { logo: string | null; name: string; size: number }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} width={size} height={size} style={{ objectFit: 'contain' }} alt="" />;
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size / 2,
        background: 'rgba(255,255,255,0.16)',
        color: '#fff',
        fontSize: Math.round(size * 0.38),
        fontWeight: 800,
      }}
    >
      {teamInitials(name)}
    </div>
  );
}

export async function renderMatchOgImage(match: Match): Promise<ImageResponse> {
  const homeName = match.home?.name || 'Ev Sahibi';
  const awayName = match.away?.name || 'Deplasman';
  const home = truncate(homeName, 20);
  const away = truncate(awayName, 20);
  const score = match.status === 'NOT STARTED' ? '' : match.scores?.score || match.score || '';
  const comp = truncate(match.competition?.name || 'Maç Detayı', 40);
  const [homeLogo, awayLogo] = await Promise.all([fetchLogoDataUri(match.home?.logo), fetchLogoDataUri(match.away?.logo)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: GREEN,
          fontFamily: 'Inter',
          position: 'relative',
        }}
      >
        {/* diyagonal koyu şerit (sağ kenar) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: -80,
            width: 260,
            height: 900,
            background: GREEN_DARK,
            transform: 'rotate(18deg)',
            display: 'flex',
          }}
        />

        {/* Üst bar: marka logosu */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '36px 56px 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO_DATA_URI} width={Math.round(48 * BRAND_LOGO_ASPECT)} height={48} alt="" />
        </div>

        {/* Lig etiketi */}
        <div style={{ display: 'flex', padding: '18px 56px 0' }}>
          <div
            style={{
              display: 'flex',
              color: '#eafff5',
              fontSize: 22,
              fontWeight: 600,
              background: 'rgba(255,255,255,0.14)',
              padding: '6px 18px',
              borderRadius: 999,
            }}
          >
            {comp}
          </div>
        </div>

        {/* Orta: takım isimleri + skor */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '0 56px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 380, gap: 16 }}>
            <TeamBadge logo={homeLogo} name={homeName} size={88} />
            <div style={{ display: 'flex', color: '#fff', fontSize: 36, fontWeight: 800, textAlign: 'center' }}>{home}</div>
          </div>

          <div
            style={{
              display: 'flex',
              color: '#fff',
              fontSize: score ? 64 : 40,
              fontWeight: 800,
              padding: '0 32px',
              minWidth: 180,
              justifyContent: 'center',
            }}
          >
            {score || 'VS'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 380, gap: 16 }}>
            <TeamBadge logo={awayLogo} name={awayName} size={88} />
            <div style={{ display: 'flex', color: '#fff', fontSize: 36, fontWeight: 800, textAlign: 'center' }}>{away}</div>
          </div>
        </div>

        {/* Alt bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 0 34px',
            color: '#eafff5',
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          ofsaytyok.app
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: ogFonts() },
  );
}
