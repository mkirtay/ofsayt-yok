/**
 * Takım paylaşım görseli (1200×630) — `/api/og/team/[id]` çizer. Maç görseliyle aynı dil: marka yeşili + sağda koyu
 * eğik şerit, sol üstte yeni logo. Solda takım logosu (beyaz daire), sağda ad, lig adı ve sırası, son 5 maç formu.
 * Font ve marka logosu gömülü; takım / lig logoları 1,5 sn zaman aşımıyla, olmazsa baş harfler (lig logosu yoksa yalnız ad).
 */
import { ImageResponse } from './imageResponse';
import { TEAM_NAMES } from '@/content/teamNames';
import type { FormResult } from '@/services/sportmonks/teamOverview';
import { BRAND_LOGO_ASPECT, BRAND_LOGO_DATA_URI, fetchLogoDataUri, ogFonts, teamInitials } from './ogAssets';
import type { TeamOgData } from './teamOgData';

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';
const TEXT_SOFT = '#eafff5';
const NAME_MAX_CHARS = 20;

/** Form rozetleri: G(alibiyet) / B(eraberlik) / M(ağlubiyet) — sitedeki form rozetleriyle aynı harfler. */
const FORM_STYLE: Record<FormResult, { letter: string; background: string; color: string }> = {
  W: { letter: 'G', background: '#ffffff', color: '#007B55' },
  D: { letter: 'B', background: 'rgba(255,255,255,0.28)', color: '#ffffff' },
  L: { letter: 'M', background: '#E5322D', color: '#ffffff' },
};

function truncate(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : `${chars.slice(0, max - 1).join('')}…`;
}

export function teamOgDisplayName(team: TeamOgData['team']): string {
  if ([...team.name].length <= NAME_MAX_CHARS) return team.name;
  const short = TEAM_NAMES[team.id]?.shortName;
  return truncate(short && [...short].length <= NAME_MAX_CHARS ? short : team.name, NAME_MAX_CHARS);
}

export async function renderTeamOgImage(data: TeamOgData): Promise<ImageResponse> {
  const [teamLogo, compLogo] = await Promise.all([fetchLogoDataUri(data.team.logo), fetchLogoDataUri(data.competition?.logo)]);
  const name = teamOgDisplayName(data.team);

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

        <div style={{ display: 'flex', padding: '40px 56px 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO_DATA_URI} width={Math.round(56 * BRAND_LOGO_ASPECT)} height={56} alt="" />
        </div>

        <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '0 72px 40px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 260,
              height: 260,
              borderRadius: 130,
              background: teamLogo ? '#ffffff' : 'rgba(255,255,255,0.16)',
              color: '#fff',
              fontSize: 96,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {teamLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={teamLogo} width={190} height={190} style={{ objectFit: 'contain' }} alt="" />
            ) : (
              teamInitials(data.team.name)
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 56, maxWidth: 680 }}>
            <div style={{ display: 'flex', color: '#fff', fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>

            {data.competition ? (
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 26 }}>
                {compLogo ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: '#ffffff',
                      marginRight: 14,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={compLogo} width={36} height={36} style={{ objectFit: 'contain' }} alt="" />
                  </div>
                ) : null}
                <div style={{ display: 'flex', color: TEXT_SOFT, fontSize: 32, fontWeight: 600 }}>
                  {truncate(data.competition.name, 26)}
                </div>
                {data.standing ? (
                  <div
                    style={{
                      display: 'flex',
                      marginLeft: 18,
                      padding: '6px 18px',
                      borderRadius: 999,
                      background: 'rgba(0,0,0,0.22)',
                      color: '#fff',
                      fontSize: 30,
                      fontWeight: 800,
                    }}
                  >
                    {`${data.standing.rank}. sıra`}
                  </div>
                ) : null}
              </div>
            ) : null}

            {data.form.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 }}>
                <div style={{ display: 'flex', color: TEXT_SOFT, fontSize: 24, fontWeight: 600, marginBottom: 12 }}>
                  Son {data.form.length} maç
                </div>
                <div style={{ display: 'flex' }}>
                  {data.form.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 58,
                        height: 58,
                        borderRadius: 12,
                        marginRight: 12,
                        background: FORM_STYLE[r].background,
                        color: FORM_STYLE[r].color,
                        fontSize: 30,
                        fontWeight: 800,
                      }}
                    >
                      {FORM_STYLE[r].letter}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: ogFonts() },
  );
}
