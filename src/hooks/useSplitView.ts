import { useEffect, useState } from 'react';
import { BP_GUNDEM_PANEL, BP_SPLIT, BP_WIDGET } from '@/config/breakpoints';

/** Split-view alt sınırı (`$bp-split`) — merkezi kaynak: config/breakpoints.ts */
export const SPLIT_VIEW_MIN_WIDTH = BP_SPLIT;
/** Ana sayfa idle Gündem paneli alt sınırı (`$bp-gundem-panel`) */
export const GUNDEM_PANEL_MIN_WIDTH = BP_GUNDEM_PANEL;
/** Sağ widget sütunu alt sınırı (`$bp-widget`) */
export const RIGHT_COLUMN_MIN_WIDTH = BP_WIDGET;

/**
 * Masaüstü split-view aktif mi?
 * `null` = henüz ölçülmedi (SSR/ilk render) → çağıran mobil/normal davranışı varsayar.
 */
export function useMinWidth(minWidth: number): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${minWidth}px)`);
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [minWidth]);

  return matches;
}

export function useSplitView(): boolean | null {
  return useMinWidth(SPLIT_VIEW_MIN_WIDTH);
}
