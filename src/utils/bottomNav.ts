/**
 * Mobil alt navigasyon — sekme tanımları ve query eşlemesi (saf, test edilebilir).
 * Ana sayfa (`MatchHubPage`) `?tab=` (maç filtresi) ve `?panel=` (yan panel sekmesi)
 * paramlarını dinler; "Gündem" ise ayrı bir sayfaya (`/gundem`) link verir.
 */
export type BottomNavKey = 'live' | 'gundem' | 'standings' | 'leagues' | 'favorites';

export const GUNDEM_PATH = '/gundem';

export const MATCH_TAB_QUERY = 'tab';
export const SIDEBAR_PANEL_QUERY = 'panel';

export type HubMatchTab = 'all' | 'live' | 'finished' | 'favorites';
export type HubSidebarTab = 'standings' | 'leagues' | 'scorers';

const MATCH_TABS: HubMatchTab[] = ['all', 'live', 'finished', 'favorites'];
const SIDEBAR_TABS: HubSidebarTab[] = ['standings', 'leagues', 'scorers'];

export function parseMatchTab(v: unknown): HubMatchTab | null {
  const s = Array.isArray(v) ? v[0] : v;
  return MATCH_TABS.includes(s as HubMatchTab) ? (s as HubMatchTab) : null;
}

export function parseSidebarTab(v: unknown): HubSidebarTab | null {
  const s = Array.isArray(v) ? v[0] : v;
  return SIDEBAR_TABS.includes(s as HubSidebarTab) ? (s as HubSidebarTab) : null;
}

/** Sekme → ana sayfa hedef query'si ("gundem" ana sayfa değil, ayrı sayfa: hedefsiz). */
export function bottomNavTarget(key: Exclude<BottomNavKey, 'gundem'>): Record<string, string> {
  switch (key) {
    case 'live':
      return { [MATCH_TAB_QUERY]: 'live' };
    case 'favorites':
      return { [MATCH_TAB_QUERY]: 'favorites' };
    case 'standings':
      return { [SIDEBAR_PANEL_QUERY]: 'standings' };
    case 'leagues':
      return { [SIDEBAR_PANEL_QUERY]: 'leagues' };
  }
}

/** Ana sayfa query'sinden aktif alt-nav sekmesi (yoksa null). Panel, maç filtresinden önceliklidir. */
export function activeBottomNavKey(pathname: string, query: Record<string, unknown>): BottomNavKey | null {
  if (pathname === GUNDEM_PATH || pathname.startsWith(`${GUNDEM_PATH}/`)) return 'gundem';
  if (pathname !== '/') return null;
  const panel = parseSidebarTab(query[SIDEBAR_PANEL_QUERY]);
  if (panel === 'standings' || panel === 'leagues') return panel;
  const tab = parseMatchTab(query[MATCH_TAB_QUERY]);
  if (tab === 'live') return 'live';
  if (tab === 'favorites') return 'favorites';
  return null;
}
