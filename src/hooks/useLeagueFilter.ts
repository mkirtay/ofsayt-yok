import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LEAGUE_FILTER,
  LEAGUE_FILTER_STORAGE_KEY,
  readLeagueFilter,
  writeLeagueFilter,
  type LeagueFilterMode,
  type LeagueFilterState,
  type PickedLeague,
} from '@/utils/leagueFilter';

/**
 * `localStorage` kalıcı lig filtresi. SSR/hydration uyumu için ilk render varsayılan (filtre yok),
 * kayıtlı değer mount'tan sonra okunur; başka sekmede değişirse `storage` olayıyla senkronlanır.
 */
export function useLeagueFilter() {
  const [state, setState] = useState<LeagueFilterState>(DEFAULT_LEAGUE_FILTER);

  useEffect(() => {
    // Kayıtlı değer mount'ta okunur (SSR'da localStorage yok → ilk render varsayılan olmak zorunda).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readLeagueFilter());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === LEAGUE_FILTER_STORAGE_KEY) setState(readLeagueFilter());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = useCallback((next: LeagueFilterState) => {
    setState(next);
    writeLeagueFilter(next);
  }, []);

  /** "Tümü" dahil mod seçimi. Kayıtlı "Liglerim" listesi korunur (chip kaybolmasın); silmek için `applyCustom([])`. */
  const selectMode = useCallback(
    (mode: LeagueFilterMode) => {
      setState((prev) => {
        const next: LeagueFilterState = { mode: mode === 'custom' && !prev.custom.length ? 'all' : mode, custom: prev.custom };
        writeLeagueFilter(next);
        return next;
      });
    },
    [],
  );

  /** Panelden "Uygula": boş seçim = özel listeyi tamamen temizle ve Tümü'ye dön (storage anahtarı silinir). */
  const applyCustom = useCallback(
    (picked: PickedLeague[]) => {
      commit(picked.length ? { mode: 'custom', custom: picked } : DEFAULT_LEAGUE_FILTER);
    },
    [commit],
  );

  return { state, selectMode, applyCustom };
}
