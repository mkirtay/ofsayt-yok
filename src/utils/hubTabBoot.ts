/**
 * Ana sayfa `?tab=` (live / finished / favorites) doğrudan açılışta ve yenilemede.
 *
 * Sayfa ISR: sunucu HTML'i sorguyu bilmez, hep "Hepsi" ile üretilir; sekme ancak hydration sonrası uygulanıyordu
 * (mobilde birkaç saniye "Hepsi" listesi + seçili "Hepsi" sekmesi, masaüstünde liste değişince kayma). Çözüm:
 * hub'ın EN BAŞINDA satır içi küçük betik (boyamadan önce çalışır) sekmeyi `<html data-hub-tab>`'a yazar →
 * CSS sekmeyi / çipi / alt menüyü baştan seçili gösterir ve "Hepsi" listesini yeri korunarak gizler.
 * Hydration sekmeyi uygulayınca (`activeTab` eşleşince) öznitelik kalkar. JS hiç çalışmazsa CSS 5 sn sonra listeyi
 * yine gösterir (bkz. index.module.scss).
 */
import { MATCH_TAB_QUERY, parseMatchTab, type HubMatchTab } from './bottomNav';

export const HUB_TAB_ATTR = 'data-hub-tab';

/** Yalnız ana sayfada ve geçerli, "Hepsi" dışı sekmede öznitelik yazılır. */
export function hubTabFromSearch(pathname: string, search: string): Exclude<HubMatchTab, 'all'> | null {
  if (pathname !== '/') return null;
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get(MATCH_TAB_QUERY);
  } catch {
    return null;
  }
  const tab = parseMatchTab(raw);
  return tab && tab !== 'all' ? tab : null;
}

/** Satır içi betik — `hubTabFromSearch` ile aynı kural (bağımlılıksız, ES5). */
export const HUB_TAB_BOOT_SCRIPT =
  "(function(){try{if(location.pathname!=='/')return;var t=new URLSearchParams(location.search).get('" +
  MATCH_TAB_QUERY +
  "');if(t==='live'||t==='finished'||t==='favorites')document.documentElement.setAttribute('" +
  HUB_TAB_ATTR +
  "',t)}catch(e){}})()";

/** Hydration sekmeyi uyguladıysa (ya da sekme artık farklıysa) ön-boyama özniteliği kalkar. */
export function clearHubTabBoot(activeTab: HubMatchTab, root: { getAttribute(n: string): string | null; removeAttribute(n: string): void }): void {
  const pending = root.getAttribute(HUB_TAB_ATTR);
  if (pending != null && pending === activeTab) root.removeAttribute(HUB_TAB_ATTR);
}
