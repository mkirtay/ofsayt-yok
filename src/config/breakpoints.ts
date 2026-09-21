/**
 * Layout eşikleri — JS tarafındaki TEK kaynak. SCSS karşılıkları `src/styles/_variables.scss`
 * içinde (`$bp-desktop`, `$bp-split`, `$bp-widget`); `breakpoints.test.ts` ikisinin
 * senkron kaldığını doğrular. Değiştirirken ikisini birlikte güncelle.
 *
 *  < BP_DESKTOP : "mobil düzen" — tek sütun, hamburger menü, alt navigasyon, tarih şeridi,
 *                 sidebar liste altında (tablet dikey/iPad dahil)
 *  ≥ BP_DESKTOP : masaüstü — tam header nav'ı, sidebar + liste iki sütun
 *  ≥ BP_SPLIT   : split-view (liste + maç detay paneli)
 *  ≥ BP_GUNDEM_PANEL : ana sayfada maç/takım seçili DEĞİLKEN Gündem paneli (idle); BP_SPLIT'ten AYRI ek eşik,
 *                 `layoutTierForWidth` katmanlarını değiştirmez
 *  ≥ BP_WIDGET  : sağ widget sütunu (HubRightColumn)
 */
export const BP_DESKTOP = 1024;
export const BP_SPLIT = 1200;
export const BP_GUNDEM_PANEL = 1440;
export const BP_WIDGET = 1536;

export type LayoutTier = 'mobile' | 'desktop' | 'split' | 'wide';

/** Verilen viewport genişliği hangi düzen katmanına düşer (CSS `min-width` semantiğiyle aynı). */
export function layoutTierForWidth(width: number): LayoutTier {
  if (width >= BP_WIDGET) return 'wide';
  if (width >= BP_SPLIT) return 'split';
  if (width >= BP_DESKTOP) return 'desktop';
  return 'mobile';
}

/** `max-width` media query'si: mobil düzen (BP_DESKTOP'un 1px altı). */
export const MOBILE_LAYOUT_QUERY = `(max-width: ${BP_DESKTOP - 1}px)`;
