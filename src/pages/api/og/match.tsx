import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export default function handler(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const home = truncate(searchParams.get('home') || 'Ev Sahibi', 20);
  const away = truncate(searchParams.get('away') || 'Deplasman', 20);
  const homeLogo = searchParams.get('homeLogo') || '';
  const awayLogo = searchParams.get('awayLogo') || '';
  const score = searchParams.get('score') || '';
  const comp = truncate(searchParams.get('comp') || 'Maç Detayı', 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: GREEN,
          fontFamily: 'sans-serif',
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

        {/* Üst bar: gerçek marka logosu */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '36px 56px 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${origin}/images/logo.svg`} width={190} height={36} alt="" />
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
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 56px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 380 }}>
            {homeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={homeLogo} width={88} height={88} style={{ marginBottom: 16 }} alt="" />
            ) : (
              <div
                style={{
                  display: 'flex',
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  background: 'rgba(255,255,255,0.16)',
                  marginBottom: 16,
                }}
              />
            )}
            <div style={{ display: 'flex', color: '#fff', fontSize: 36, fontWeight: 700, textAlign: 'center' }}>
              {home}
            </div>
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

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 380 }}>
            {awayLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={awayLogo} width={88} height={88} style={{ marginBottom: 16 }} alt="" />
            ) : (
              <div
                style={{
                  display: 'flex',
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  background: 'rgba(255,255,255,0.16)',
                  marginBottom: 16,
                }}
              />
            )}
            <div style={{ display: 'flex', color: '#fff', fontSize: 36, fontWeight: 700, textAlign: 'center' }}>
              {away}
            </div>
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
    {
      width: 1200,
      height: 630,
    }
  );
}
