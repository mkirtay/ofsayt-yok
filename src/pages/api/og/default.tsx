import { ImageResponse } from 'next/og';

export const config = {
  runtime: 'edge',
};

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';

export default function handler() {
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
          <div style={{ display: 'flex', width: 14, height: 64, background: '#fff', marginRight: 10 }} />
          <div style={{ display: 'flex', width: 70, height: 46, background: '#fff', marginRight: 22 }} />
          <div style={{ display: 'flex', color: '#fff', fontSize: 64, fontWeight: 800, letterSpacing: 1 }}>
            OFSAYT YOK
          </div>
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
