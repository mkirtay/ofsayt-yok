/**
 * Mobil alt navigasyon — sekme tanımları ve query eşlemesi (saf, test edilebilir).
 * Ana sayfa (`MatchHubPage`) `?tab=` (maç filtresi) ve `?panel=` (yan panel sekmesi)
 * paramlarını dinler; "Diğer" sekmesi header'daki mobil menüyü açar.
 */
export const OPEN_MENU_EVENT = 'oy:toggle-mobile-menu';

export type BottomNavKey = 'live' | 'standings' | 'leagues' | 'favorites' | 'more';

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

/** Sekme → ana sayfa hedef query'si ("more" hedefsiz: menü açar). */
export function bottomNavTarget(key: Exclude<BottomNavKey, 'more'>): Record<string, string> {
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
  if (pathname !== '/') return null;
  const panel = parseSidebarTab(query[SIDEBAR_PANEL_QUERY]);
  if (panel === 'standings' || panel === 'leagues') return panel;
  const tab = parseMatchTab(query[MATCH_TAB_QUERY]);
  if (tab === 'live') return 'live';
  if (tab === 'favorites') return 'favorites';
  return null;
}
