import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';

export default function handler(req: NextRequest) {
  const { origin } = new URL(req.url);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: GREEN,
          fontFamily: 'sans-serif',
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

        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${origin}/images/logo.svg`} width={380} height={72} alt="" />
        </div>

        <div style={{ display: 'flex', color: '#eafff5', fontSize: 30, fontWeight: 600 }}>
          Canlı Skorlar · Maç Analizi · Puan Durumu
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
