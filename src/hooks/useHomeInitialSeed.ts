import { useState } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { homeHubMatchesQueryKey, upcomingMatchDaysQueryKey, type HomeHubMatchesData } from '@/hooks/useHomeHubMatches';
import { competitionSidebarQueryKey } from '@/hooks/useCompetitionSidebar';
import { TURKEY_TEAM_TIERS_QUERY_KEY } from '@/hooks/useTurkeyTeamTiers';
import { unpackHomeMatches, type HomeInitialData } from '@/utils/homeInitialData';

/**
 * Maç verisi "çok eski" damgasıyla yazılır (0 = hiç güncellenmedi sayılır; 1 ms): sorgu mount'ta bayat → hemen
 * tazelenir, liste o sırada sunucudan gelen veriyle görünür (iskelet yok). HTML'in yaşı props'ta yok (deterministik
 * ISR), istemci bunu bilemediği için maç verisini her zaman tazeler.
 */
export const SEEDED_STALE_UPDATED_AT = 1;

function setIfAbsent<T>(qc: QueryClient, key: QueryKey, data: T, updatedAt: number) {
  const state = qc.getQueryState(key);
  // Cache'te zaten veri varsa (ör. istemci tarafı geri dönüş) daha tazedir → dokunma.
  if (state && state.data !== undefined) return;
  qc.setQueryData(key, data, { updatedAt });
}

/**
 * ISR ile gelen ilk ekran verisini react-query'ye AYNI anahtarlarla yazar (polling / refetchInterval davranışı aynen
 * kalır). Yavaş değişen veriler (puan durumu, sezonlar, sıradaki maç günü, kupa kademeleri) şimdi alınmış sayılır;
 * kendi staleTime'larına göre yenilenir.
 */
export function seedHomeQueries(qc: QueryClient, init: HomeInitialData, now: number): void {
  const matches: HomeHubMatchesData = { ...unpackHomeMatches(init.matches), stale: false };
  setIfAbsent(qc, homeHubMatchesQueryKey(init.date), matches, SEEDED_STALE_UPDATED_AT);
  if (init.upcoming) setIfAbsent(qc, upcomingMatchDaysQueryKey(init.date), init.upcoming, now);
  if (init.sidebar) setIfAbsent(qc, competitionSidebarQueryKey(init.sidebar.competitionId), init.sidebar.data, now);
  if (init.cupTiers) setIfAbsent(qc, TURKEY_TEAM_TIERS_QUERY_KEY, init.cupTiers, now);
}

/** İlk render'dan ÖNCE (çocuk sorgular abone olmadan) bir kez tohumlar — sunucu ve istemcinin ilk render'ı aynı veriyi görür. */
export function useHomeInitialSeed(init: HomeInitialData | null | undefined): void {
  const qc = useQueryClient();
  useState(() => {
    if (init) seedHomeQueries(qc, init, Date.now());
    return null;
  });
}
