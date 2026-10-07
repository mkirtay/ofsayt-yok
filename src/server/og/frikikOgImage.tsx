/**
 * /frikik paylaşım görseli (1200×630) — skor kartı. Diğer paylaşım görselleriyle aynı dil: marka yeşili + sağda koyu
 * eğik şerit, sol üstte logo. Seviye koşusu (seviye + puan); yoksa oyunun genel kartı. Font ve logo
 * gömülü (dış istek yok).
 */
import type { ShareInfo } from '@/lib/frikik/share';
import { ImageResponse } from './imageResponse';
import { BRAND_LOGO_ASPECT, BRAND_LOGO_DATA_URI, ogFonts } from './ogAssets';

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';

const fmt = (n: number) => n.toLocaleString('tr-TR');

export function renderFrikikOgImage(info: ShareInfo | null): ImageResponse {
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
          {info ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <div style={{ display: 'flex', color: '#eafff5', fontSize: 64, fontWeight: 800, marginRight: 24 }}>SEVİYE</div>
                <div style={{ display: 'flex', color: '#fff', fontSize: 190, fontWeight: 800, lineHeight: 1 }}>{info.level}</div>
              </div>
              <div style={{ display: 'flex', color: '#fff', fontSize: 64, fontWeight: 800, marginTop: 10 }}>{fmt(info.score)} puan</div>
            </div>
          ) : (
            <div style={{ display: 'flex', color: '#fff', fontSize: 92, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>Serbest vuruş oyunu</div>
          )}
          <div style={{ display: 'flex', color: '#eafff5', fontSize: 38, fontWeight: 600, marginTop: 22 }}>
            {info ? 'Günün frikiği, 3 can. Sen kaça ulaşırsın?' : 'Günün frikiği: 3 can. Barajı aş, kaleciyi geç.'}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: ogFonts() },
  );
}
