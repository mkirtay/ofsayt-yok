/**
 * /frikik paylaşım görseli (1200×630) — skor kartı. Diğer paylaşım görselleriyle aynı dil: marka yeşili + sağda koyu
 * eğik şerit, sol üstte logo. Skor yoksa oyunun genel kartı. Font ve logo gömülü (dış istek yok).
 */
import { ImageResponse } from './imageResponse';
import { BRAND_LOGO_ASPECT, BRAND_LOGO_DATA_URI, ogFonts } from './ogAssets';

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';

export function renderFrikikOgImage(score: number | null): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: GREEN, fontFamily: 'Inter', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, right: -80, width: 260, height: 900, background: GREEN_DARK, transform: 'rotate(18deg)', display: 'flex' }} />
        <div style={{ display: 'flex', padding: '40px 56px 0' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_LOGO_DATA_URI} width={Math.round(56 * BRAND_LOGO_ASPECT)} height={56} alt="" />
        </div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', padding: '0 72px 48px' }}>
          <div style={{ display: 'flex', color: '#eafff5', fontSize: 40, fontWeight: 800, letterSpacing: 6 }}>FRİKİK</div>
          {score != null ? (
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 8 }}>
              <div style={{ display: 'flex', color: '#fff', fontSize: 190, fontWeight: 800, lineHeight: 1 }}>{score}</div>
              <div style={{ display: 'flex', color: '#eafff5', fontSize: 56, fontWeight: 800, marginLeft: 20 }}>puan</div>
            </div>
          ) : (
            <div style={{ display: 'flex', color: '#fff', fontSize: 92, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>Serbest vuruş oyunu</div>
          )}
          <div style={{ display: 'flex', color: '#eafff5', fontSize: 38, fontWeight: 600, marginTop: 22 }}>
            {score != null ? '5 serbest vuruşta. Sen kaç yaparsın?' : '5 vuruş. Barajı aş, kaleciyi geç.'}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: ogFonts() },
  );
}
