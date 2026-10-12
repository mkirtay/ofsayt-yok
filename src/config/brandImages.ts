import { BRAND } from '@/config/brand';

/**
 * Marka görselleri — kaynak SVG'ler `public/brand/scor3-02-skorbord-*.svg` (hazır vektör); PNG/ICO/OG çıktılarını
 * `scripts/generate-brand-images.mjs` üretir. Görsel değişince dosya adını sürümle (-v4 …): Facebook / Instagram / X
 * paylaşım önbelleği URL'ye göre tutar, aynı adla yeni görsel uzun süre görünmez.
 */
export const OG_DEFAULT_IMAGE = {
  path: '/images/og-default-v3.png',
  width: 1200,
  height: 630,
  alt: `${BRAND.name} — ${BRAND.tagline.tr}`,
} as const;

/** Yapılandırılmış veri (JSON-LD Organization / publisher) logosu: kare, beyaz zeminde de görünür (lime kare). */
export const BRAND_LOGO_PNG = '/brand/icon-512.png';

/** Yatay logo, koyu zemin için (açık yazı). Header ve footer her iki temada da koyu zeminli. */
export const BRAND_LOGO_SVG_ON_DARK = '/brand/scor3-02-skorbord-koyu-zemin.svg';
/** Yatay logo, açık zemin için (koyu yazı). */
export const BRAND_LOGO_SVG_ON_LIGHT = '/brand/scor3-02-skorbord-acik-zemin.svg';
/** Yatay logonun en/boy oranı (viewBox 551,19 × 184). */
export const BRAND_LOGO_ASPECT = 551.19 / 184;

/** Sekme ikonu (SVG) ve PWA ikonları. */
export const BRAND_ICON_SVG = '/brand/scor3-02-skorbord-ikon.svg';
export const BRAND_PWA_ICONS = [
  { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;

/** Uygulama zemini (manifest background_color / theme_color): logo paletindeki siyah. */
export const BRAND_INK = '#0A0E13';
