/**
 * Maç sayfası sekme derin bağlantısı: `?sekme=ai-analiz` → AI Analiz sekmesi seçilir ve sekme şeridine kaydırılır.
 *
 * GÜVENCE: bu bağlantı YALNIZ sekmeyi açar. `applyTabDeepLink` iki işlem alır (sekme seç, kaydır); analiz üretimi ya da
 * kredi harcayan hiçbir işleve erişimi yoktur — üretim/açma yalnız kullanıcının AI Analiz sekmesindeki düğmeye
 * tıklamasıyla başlar (MatchAnalysis). Test: tabDeepLink.test.ts.
 */
export type DeepLinkTab = 'analysis';

const TAB_BY_PARAM: Readonly<Record<string, DeepLinkTab>> = { 'ai-analiz': 'analysis' };

/** `search`: "?sekme=ai-analiz" ya da tam yol ("/matches/1-a-b?sekme=ai-analiz#x"). */
export function tabFromSearch(search: string): DeepLinkTab | null {
  const q = search.includes('?') ? search.slice(search.indexOf('?')) : search;
  const value = new URLSearchParams(q.split('#')[0]).get('sekme');
  return (value && Object.prototype.hasOwnProperty.call(TAB_BY_PARAM, value) ? TAB_BY_PARAM[value] : null) ?? null;
}

export type TabDeepLinkActions = { selectTab: (tab: DeepLinkTab) => void; scrollToTabs: () => void };

/** Adreste sekme varsa seçer ve kaydırır; yoksa hiçbir şey yapmaz. Uygulandıysa true. */
export function applyTabDeepLink(search: string, actions: TabDeepLinkActions): boolean {
  const tab = tabFromSearch(search);
  if (!tab) return false;
  actions.selectTab(tab);
  actions.scrollToTabs();
  return true;
}
