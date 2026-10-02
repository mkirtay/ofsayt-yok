import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BRAND_LOGO_PNG, BRAND_LOGO_SVG, OG_DEFAULT_IMAGE } from './brandImages';

const pub = (p: string) => path.join(process.cwd(), 'public', p);
const src = (p: string) => readFileSync(path.join(process.cwd(), 'src', p), 'utf8');

/** Marka görselleri üretilmiş dosyalarla ve sayfalardaki düz yazılmış referanslarla tutarlı (bkz. brandImages.ts). */
describe('marka görselleri', () => {
  it('varsayılan paylaşım görseli: 1200×630 PNG, 300 KB altı', async () => {
    const meta = await sharp(pub(OG_DEFAULT_IMAGE.path)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', OG_DEFAULT_IMAGE.width, OG_DEFAULT_IMAGE.height]);
    expect(statSync(pub(OG_DEFAULT_IMAGE.path)).size).toBeLessThan(300 * 1024);
  });

  it('_app ve ana sayfa düz yazılmış yolları config ile aynı; eski logo ve /api/og/default referansı yok', () => {
    const app = src('pages/_app.tsx');
    expect(app).toContain(`'https://ofsaytyok.app'}${OG_DEFAULT_IMAGE.path}`);
    expect(app).toContain(`content="${OG_DEFAULT_IMAGE.alt}"`);
    expect(app).toContain('href="/apple-touch-icon.png"');
    expect(app).not.toContain('/api/og/default');
    expect(src('pages/index.tsx')).toContain(`'https://ofsaytyok.app'}${BRAND_LOGO_PNG}`);
    for (const f of ['pages/_app.tsx', 'pages/index.tsx', 'pages/news/[id].tsx', 'pages/api/og/match.tsx']) {
      expect(src(f)).not.toContain('/images/logo.svg');
    }
  });

  it('ikonlar: apple-touch-icon 180, JSON-LD logosu 512 kare, favicon.ico 3 boyut; yeni logo dosyası var', async () => {
    expect((await sharp(pub('apple-touch-icon.png')).metadata()).width).toBe(180);
    const logo = await sharp(pub(BRAND_LOGO_PNG)).metadata();
    expect([logo.width, logo.height]).toEqual([512, 512]);
    const ico = readFileSync(pub('favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect(statSync(pub(BRAND_LOGO_SVG)).size).toBeGreaterThan(0);
  });
});
