#!/usr/bin/env node
/**
 * Marka görsellerini güncel logodan (public/images/ofsaytyok-logo.svg, public/icon.svg) yeniden üretir:
 *
 * - public/images/og-default-v2.png  1200×630 varsayılan paylaşım görseli (og:image / twitter:image). Kompozisyon eski
 *   `/api/og/default` ile aynı (marka yeşili zemin, sağda koyu yeşil eğik şerit, ortada logo, altında alt yazı) ve
 *   aynı çizim motoruyla (next/og → satori) çizilir; yalnız logo yeni.
 * - public/apple-touch-icon.png      180×180 (iOS SVG kabul etmiyor) — icon.svg'den.
 * - public/icon-512.png              512×512 — yapılandırılmış veri (JSON-LD Organization / publisher) logosu; icon.svg'den.
 * - public/favicon.ico               16/32/48 — logonun yalnız işareti (sol kısım) yeşil kare üstünde: tam logo 16–48 px'te
 *   okunmuyor.
 *
 * Kullanım: `node scripts/generate-brand-images.mjs`. Dosya adı değişirse (önbellek kırma: -v3 …) referansları da güncelle:
 * src/config/brandImages.ts.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import sharp from 'sharp';
import { ImageResponse } from 'next/og.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (...p) => path.join(root, 'public', ...p);

const GREEN = '#00A76F';
const GREEN_DARK = '#007B55';
const SUBTITLE = 'Canlı Skorlar · Maç Analizi · Puan Durumu';
const OG_MAX_BYTES = 300 * 1024;

/** ofsaytyok-logo.svg: viewBox 0 0 138 42; işaret x 0–36 (ölçüldü: 36'dan sonra boş sütun, yazı 37,2'de başlıyor). */
const LOGO_VIEWBOX = { w: 138, h: 42 };
const MARK_WIDTH = 36;

const h = React.createElement;

async function ogDefault(logoSvg) {
  const logoSrc = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
  const logoWidth = 400;
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
        background: GREEN,
        fontFamily: 'sans-serif',
        position: 'relative',
      },
    },
    h('div', {
      style: {
        position: 'absolute',
        top: 0,
        right: -80,
        width: 260,
        height: 900,
        background: GREEN_DARK,
        transform: 'rotate(18deg)',
        display: 'flex',
      },
    }),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', marginBottom: 28 } },
      h('img', { src: logoSrc, width: logoWidth, height: logoHeight, alt: '' }),
    ),
    h('div', { style: { display: 'flex', color: '#eafff5', fontSize: 30, fontWeight: 600 } }, SUBTITLE),
  );
  const res = new ImageResponse(tree, { width: 1200, height: 630 });
  const raw = Buffer.from(await res.arrayBuffer());
  // Düz renkler → palet PNG çok küçük ve görsel olarak aynı.
  const png = await sharp(raw).png({ palette: true, colors: 128, compressionLevel: 9, effort: 10 }).toBuffer();
  if (png.length > OG_MAX_BYTES) throw new Error(`og-default ${png.length} B > ${OG_MAX_BYTES} B`);
  return png;
}

/** Logo SVG'sinden yalnız işaret: yeşil kare, işaret ortada (yüksekliğin %72'si). */
function markIconSvg(logoSvg, size) {
  const inner = logoSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const markH = size * 0.72;
  const markW = (markH * MARK_WIDTH) / LOGO_VIEWBOX.h;
  const x = (size - markW) / 2;
  const y = (size - markH) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${GREEN}"/>
<svg x="${x}" y="${y}" width="${markW}" height="${markH}" viewBox="0 0 ${MARK_WIDTH} ${LOGO_VIEWBOX.h}" overflow="hidden">${inner}</svg>
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
  const logoSvg = await readFile(pub('images', 'ofsaytyok-logo.svg'), 'utf8');
  const iconSvg = await readFile(pub('icon.svg'));

  const og = await ogDefault(logoSvg);
  await writeFile(pub('images', 'og-default-v2.png'), og);

  const fromIcon = (size) => sharp(iconSvg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  const touch = await fromIcon(180);
  await writeFile(pub('apple-touch-icon.png'), touch);
  const icon512 = await fromIcon(512);
  await writeFile(pub('icon-512.png'), icon512);

  const favSizes = [16, 32, 48];
  const favPngs = [];
  for (const size of favSizes) {
    // Büyük çizip küçült: ince çizgiler daha temiz.
    const data = await sharp(Buffer.from(markIconSvg(logoSvg, 256)), { density: 72 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    favPngs.push({ size, data });
  }
  const favicon = ico(favPngs);
  await writeFile(pub('favicon.ico'), favicon);

  for (const [name, buf] of [
    ['images/og-default-v2.png', og],
    ['apple-touch-icon.png', touch],
    ['icon-512.png', icon512],
    ['favicon.ico', favicon],
  ]) {
    console.log(`${name.padEnd(28)} ${(buf.length / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
