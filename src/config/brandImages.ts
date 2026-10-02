/**
 * Marka görselleri — `scripts/generate-brand-images.mjs` üretir (kaynak: public/images/ofsaytyok-logo.svg,
 * public/icon.svg). Görsel değişince dosya adını sürümle (-v3 …): Facebook / Instagram / X paylaşım önbelleği URL'ye
 * göre tutar, aynı adla yeni görsel uzun süre görünmez.
 */
export const OG_DEFAULT_IMAGE = {
  path: '/images/og-default-v2.png',
  width: 1200,
  height: 630,
  alt: 'Ofsayt Yok — Canlı Skorlar · Maç Analizi · Puan Durumu',
} as const;

/** Yapılandırılmış veri (JSON-LD Organization / publisher) logosu: kare, beyaz zeminde de görünür (yeşil kare). */
export const BRAND_LOGO_PNG = '/icon-512.png';

/** Yeni logo (beyaz, şeffaf zemin — yeşil üstünde kullanılır). */
export const BRAND_LOGO_SVG = '/images/ofsaytyok-logo.svg';
