import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  BRAND_ICON_SVG,
  BRAND_LOGO_PNG,
  BRAND_LOGO_SVG_ON_DARK,
  BRAND_LOGO_SVG_ON_LIGHT,
  BRAND_PWA_ICONS,
  OG_DEFAULT_IMAGE,
} from './brandImages';
import { buildWebManifest } from '@/pages/manifest.webmanifest';
import { BRAND } from './brand';

const pub = (p: string) => path.join(process.cwd(), 'public', p);
const src = (p: string) => readFileSync(path.join(process.cwd(), 'src', p), 'utf8');

/** Marka görselleri üretilmiş dosyalarla ve sayfalardaki düz yazılmış referanslarla tutarlı (bkz. brandImages.ts). */
describe('marka görselleri', () => {
  it('varsayılan paylaşım görseli: 1200×630 PNG, 300 KB altı', async () => {
    const meta = await sharp(pub(OG_DEFAULT_IMAGE.path)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', OG_DEFAULT_IMAGE.width, OG_DEFAULT_IMAGE.height]);
    expect(statSync(pub(OG_DEFAULT_IMAGE.path)).size).toBeLessThan(300 * 1024);
  });

  it('_app ve ana sayfa görsel yollarını config\'den okur; eski logo ve /api/og/default referansı yok', () => {
    const app = src('pages/_app.tsx');
    expect(app).toContain('${siteBaseUrl()}${OG_DEFAULT_IMAGE.path}');
    expect(app).toContain('content={OG_DEFAULT_IMAGE.alt}');
    expect(app).not.toContain('og-default-v');
    expect(app).toContain('href="/apple-touch-icon.png"');
    expect(app).not.toContain('/api/og/default');
    expect(src('pages/index.tsx')).toContain('${siteBaseUrl()}${BRAND_LOGO_PNG}');
    for (const f of ['pages/_app.tsx', 'pages/index.tsx', 'pages/news/[id].tsx', 'server/og/matchOgImage.tsx']) {
      expect(src(f)).not.toContain('/images/logo.svg');
    }
  });

  it('paylaşım görseli alt metni marka adıyla başlar', () => {
    expect(OG_DEFAULT_IMAGE.alt.startsWith(`${BRAND.name} — `)).toBe(true);
  });

  it('ikonlar: apple-touch-icon 180 köşesiz, JSON-LD logosu 512 kare, favicon.ico 3 boyut, favicon PNG 16/32', async () => {
    const touch = await sharp(pub('apple-touch-icon.png')).raw().toBuffer({ resolveWithObject: true });
    expect([touch.info.width, touch.info.height]).toEqual([180, 180]);
    // Köşe pikseli opak (iOS şeffaf köşeyi siyah doldurur).
    expect(touch.info.channels < 4 || touch.data[3] === 255).toBe(true);
    const logo = await sharp(pub(BRAND_LOGO_PNG)).metadata();
    expect([logo.width, logo.height]).toEqual([512, 512]);
    const ico = readFileSync(pub('favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48]);
    for (const size of [16, 32]) {
      expect((await sharp(pub(`brand/favicon-${size}.png`)).metadata()).width).toBe(size);
    }
  });

  it('Scor3 SVG kaynakları yerinde; sekme ikonu SVG ve yatay logolar', () => {
    for (const f of [BRAND_ICON_SVG, BRAND_LOGO_SVG_ON_DARK, BRAND_LOGO_SVG_ON_LIGHT]) {
      expect(readFileSync(pub(f), 'utf8')).toContain('aria-label="Scor3"');
    }
    expect(readFileSync(pub(BRAND_ICON_SVG), 'utf8')).toContain('viewBox="0.00 0.00 168.00 168.00"');
    expect(src('pages/_app.tsx')).toContain('href={BRAND_ICON_SVG}');
  });

  it('manifest: PWA ikonları 192/512 + maskable 512 (tam dolu zemin) ve dosya boyutları tutarlı', async () => {
    const m = buildWebManifest();
    expect(m.name).toBe(BRAND.name);
    expect(m.icons).toBe(BRAND_PWA_ICONS);
    for (const icon of BRAND_PWA_ICONS) {
      const meta = await sharp(pub(icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
    }
    const maskable = BRAND_PWA_ICONS.find((i) => i.purpose === 'maskable')!;
    const { data, info } = await sharp(pub(maskable.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Dört köşe lime ve opak: güvenli alan dışı tamamen zemin.
    for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
      const i = (y * info.width + x) * 4;
      expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([0xc6, 0xff, 0x3a, 255]);
    }
    // İşaret (koyu piksel) güvenli daire (yarıçap %40) içinde; kenardan kenara şerit hariç (y 81–87 / 168).
    const c = info.width / 2;
    const barTop = (80 / 168) * info.height;
    const barBottom = (88 / 168) * info.height;
    let maxR = 0;
    for (let y = 0; y < info.height; y++) {
      if (y >= barTop && y <= barBottom) continue;
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        if (data[i] < 0x40 && data[i + 1] < 0x40) maxR = Math.max(maxR, Math.hypot(x + 0.5 - c, y + 0.5 - c));
      }
    }
    expect(maxR).toBeGreaterThan(0);
    expect(maxR / info.width).toBeLessThan(0.4 * 0.8);
  });
});
