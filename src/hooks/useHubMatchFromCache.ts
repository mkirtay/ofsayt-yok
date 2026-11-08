import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import type { HomeHubMatchesData } from '@/hooks/useHomeHubMatches';

/** Önbellekteki gün listelerinde (`home-hub-matches`) maçın en güncel hâli; yoksa null. Saf (test edilir). */
export function findHubMatch(datas: Array<HomeHubMatchesData | undefined>, matchId: number): Match | null {
  for (const d of datas) {
    if (!d) continue;
    // Canlı liste önce: aynı maçın en taze hâli.
    for (const list of [d.liveMatches, d.allMatches, d.fixtureMatches, d.nightMatches]) {
      const hit = list?.find((m) => Number(m.id) === matchId);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Ana sayfanın günlük maç listelerini (react-query `home-hub-matches`, kendi canlı yoklamasıyla güncellenir) OKUR —
 * yeni istek ya da yoklama döngüsü açmaz. Gündem maç kartı canlı skoru buradan alır; liste önbellekte yoksa (ör. Gündem
 * sayfası) null → kart sunucudaki hâliyle kalır.
 */
export function useHubMatchFromCache(matchId: number | null): Match | null {
  const qc = useQueryClient();
  const subscribe = useCallback((onChange: () => void) => qc.getQueryCache().subscribe(onChange), [qc]);
  const getSnapshot = useCallback(() => {
    if (matchId == null) return null;
    const datas = qc
      .getQueryCache()
      .findAll({ queryKey: ['home-hub-matches'] })
      .map((q) => q.state.data as HomeHubMatchesData | undefined);
    return findHubMatch(datas, matchId);
  }, [qc, matchId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
