#!/usr/bin/env node
/**
 * Marka görsellerini Scor3 logo SVG'lerinden (public/brand/scor3-02-skorbord-*.svg — hazır vektör, elle düzenlenmez)
 * yeniden üretir:
 *
 * - public/images/og-default-v3.png  1200×630 varsayılan paylaşım görseli (og:image / twitter:image): koyu zemin,
 *   ortada koyu-zemin logosu, altında alt yazı, altta lime şerit. next/og (satori) ile çizilir.
 * - public/images/og-default-v2.png  v3'ün birebir kopyası: eski sayfaların (sosyal ağ / arama önbelleği) og:image
 *   adresi 404 vermesin. Yönlendirme yerine dosya: bazı tarayıcılar (WhatsApp, LinkedIn, Slack …) og:image
 *   yönlendirmesini izlemiyor.
 * - src/server/og/brandLogo.generated.ts  koyu-zemin logosu (SVG, base64) — dinamik paylaşım görsellerine gömülü.
 * - public/favicon.ico               16/32/48 (PNG gömülü ICO) — ikon SVG'sinden.
 * - public/brand/favicon-16.png, favicon-32.png
 * - public/apple-touch-icon.png      180×180, köşesiz tam dolu (iOS köşeyi kendisi yuvarlar; şeffaf köşe siyah görünür).
 * - public/brand/icon-192.png, icon-512.png  PWA ikonları (purpose "any"); icon-512 aynı zamanda JSON-LD logosu.
 * - public/brand/icon-maskable-512.png  tam dolu lime zemin, işaret güvenli alanın (merkezde %80 çaplı daire) içinde.
 *
 * Kullanım: `node scripts/generate-brand-images.mjs`. OG dosya adı değişirse (önbellek kırma: -v4 …) referansı da
 * güncelle: src/config/brandImages.ts.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import sharp from 'sharp';
import { ImageResponse } from 'next/og.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (...p) => path.join(root, 'public', ...p);

const LIME = '#C6FF3A';
const INK = '#0A0E13';
const SUBTITLE = 'Canlı Skorlar · Maç Analizi · Puan Durumu';
const SUBTITLE_COLOR = 'rgba(243,244,238,0.78)';
const OG_MAX_BYTES = 300 * 1024;

/** Yatay logo viewBox: -0.87 -143.47 551.19 184 (koyu ve açık zemin aynı). */
const LOGO_VIEWBOX = { w: 551.19, h: 184 };
/** İkon viewBox 0 0 168 168; işaret (3) merkezde, yatay şerit kenardan kenara. */
const ICON_SIZE = 168;
/** Maskable: işaret bu oranla küçültülür → en uzak köşesi merkezden ~%28 (güvenli daire yarıçapı %40). */
const MASKABLE_SCALE = 0.85;

const h = React.createElement;

async function ogDefault(logoSvg) {
  const logoSrc = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
  const logoWidth = 600;
  const logoHeight = Math.round((logoWidth * LOGO_VIEWBOX.h) / LOGO_VIEWBOX.w);
  const tree = h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: INK,
        fontFamily: 'sans-serif',
        position: 'relative',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', marginBottom: 40 } },
      h('img', { src: logoSrc, width: logoWidth, height: logoHeight, alt: '' }),
    ),
    h('div', { style: { display: 'flex', color: SUBTITLE_COLOR, fontSize: 32, fontWeight: 600 } }, SUBTITLE),
    h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 14, background: LIME, display: 'flex' } }),
  );
  const res = new ImageResponse(tree, { width: 1200, height: 630 });
  const raw = Buffer.from(await res.arrayBuffer());
  // Düz renkler → palet PNG çok küçük ve görsel olarak aynı.
  const png = await sharp(raw).png({ palette: true, colors: 128, compressionLevel: 9, effort: 10 }).toBuffer();
  if (png.length > OG_MAX_BYTES) throw new Error(`og-default ${png.length} B > ${OG_MAX_BYTES} B`);
  return png;
}

/** Köşesiz tam dolu kare (apple-touch-icon). */
function fullBleedIcon(iconSvg) {
  const out = iconSvg.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, '$1');
  if (out === iconSvg) throw new Error('ikon SVG: zemin rect rx bulunamadı');
  return out;
}

/** Maskable: tam dolu zemin + kenardan kenara şerit; yalnız işaret (path) merkez etrafında küçültülür. */
function maskableIcon(iconSvg) {
  const glyph = iconSvg.match(/<path\b[^>]*\/>/)?.[0];
  const bar = iconSvg.match(/<rect\b(?![^>]*\brx=)[^>]*\/>/)?.[0];
  if (!glyph || !bar) throw new Error('ikon SVG: işaret veya şerit bulunamadı');
  const c = ICON_SIZE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">
<rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="${LIME}"/>${bar}
<g transform="translate(${c} ${c}) scale(${MASKABLE_SCALE}) translate(${-c} ${-c})">${glyph}</g>
</svg>`;
}

/** PNG gömülü ICO (Vista+ ve tüm güncel tarayıcılar). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  const logoSvg = await readFile(pub('brand', 'scor3-02-skorbord-koyu-zemin.svg'), 'utf8');
  const iconSvg = await readFile(pub('brand', 'scor3-02-skorbord-ikon.svg'), 'utf8');

  await writeFile(
    path.join(root, 'src', 'server', 'og', 'brandLogo.generated.ts'),
    `// ÜRETİLDİ: scripts/generate-brand-images.mjs — elle düzenleme. Kaynak: public/brand/scor3-02-skorbord-koyu-zemin.svg (${LOGO_VIEWBOX.w}×${LOGO_VIEWBOX.h}).\n` +
      `export const BRAND_LOGO_DATA_URI = 'data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}';\n` +
      `export const BRAND_LOGO_ASPECT = ${LOGO_VIEWBOX.w / LOGO_VIEWBOX.h};\n`,
  );

  // Büyük çizip küçült: ince kenarlar daha temiz.
  const render = (svg, size) =>
    sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

  const outputs = [];
  const out = async (rel, buf) => {
    await writeFile(pub(...rel.split('/')), buf);
    outputs.push([rel, buf]);
  };

  const og = await ogDefault(logoSvg);
  await out('images/og-default-v3.png', og);
  await out('images/og-default-v2.png', og);

  const favPngs = [];
  for (const size of [16, 32, 48]) favPngs.push({ size, data: await render(iconSvg, size) });
  await out('favicon.ico', ico(favPngs));
  await out('brand/favicon-16.png', favPngs[0].data);
  await out('brand/favicon-32.png', favPngs[1].data);

  await out('apple-touch-icon.png', await render(fullBleedIcon(iconSvg), 180));
  await out('brand/icon-192.png', await render(iconSvg, 192));
  await out('brand/icon-512.png', await render(iconSvg, 512));
  await out('brand/icon-maskable-512.png', await render(maskableIcon(iconSvg), 512));

  for (const [name, buf] of outputs) console.log(`${name.padEnd(30)} ${(buf.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
