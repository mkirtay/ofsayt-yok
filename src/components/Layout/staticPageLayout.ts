/**
 * Kısa, veri beklemeyen sayfalar (iletişim, yasal metinler, kredi, giriş/kayıt, 404/500): gövde kalan boşluğu
 * doldurur; içerik kısaysa footer ekranın altına oturur, uzunsa içeriğin altında durur.
 *
 * Diğer sayfalarda `main` en az ekran boyu kalır (footer ilk boyamada ekranın dışında): içerik istemcide yüklenip
 * uzadıkça görünür alandaki footer aşağı kaymasın (CLS). Bu yüzden düzen sayfa listesine göre seçilir.
 */
const STATIC_PAGE_PATHS = new Set(['/iletisim', '/gizlilik-politikasi', '/kullanim-sartlari', '/credits', '/404', '/500']);

export function usesStaticPageLayout(pathname: string): boolean {
  return STATIC_PAGE_PATHS.has(pathname) || pathname.startsWith('/auth/');
}
