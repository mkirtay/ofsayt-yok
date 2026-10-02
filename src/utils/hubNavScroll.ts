/**
 * Ana sayfa `?tab` / `?panel` değişince mobilde ilgili bölüme kaydırılır mı? Yalnız alt menü bağlantıları
 * (Canlı → liste, Puan Durumu / Ligler → yan panel) içindir. Sayfa içi durum çiplerinden gelen değişiklik
 * (`fromInPageControl`) kaydırmaz — kullanıcı zaten listenin üstünde, çip satırı ekrandan çıkmasın.
 */
export function hubSectionToScroll(input: {
  prevKey: string | null;
  nextKey: string;
  isMobile: boolean;
  fromInPageControl: boolean;
  hasPanel: boolean;
}): 'hub-list' | 'hub-sidebar' | null {
  const { prevKey, nextKey, isMobile, fromInPageControl, hasPanel } = input;
  if (prevKey === null || prevKey === nextKey || !isMobile || fromInPageControl) return null;
  return hasPanel ? 'hub-sidebar' : 'hub-list';
}
