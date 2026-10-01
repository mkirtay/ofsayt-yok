import { useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import type { HomeDayPayload, UpcomingLeagueDay } from '@/server/homeDay';
import { homePollDelayMs } from '@/utils/matchActivity';
import { isTurkishCupMatch } from '@/utils/cupTeamTier';
import { fetchTurkeyTeamTiers, TURKEY_TEAM_TIERS_QUERY_KEY, TURKEY_TEAM_TIERS_STALE_MS } from '@/hooks/useTurkeyTeamTiers';

export type HomeHubMatchesData = {
  allMatches: Match[];
  liveMatches: Match[];
  fixtureMatches: Match[];
  /** Sunucu upstream hatası yüzünden son geçerli veriyi verdi ("veriler gecikmeli"). */
  stale?: boolean;
};

/**
 * Günün maçları normalize uç noktadan (`/api/matches/day`) — tarayıcı ham Sportmonks path'lerini
 * çağırmaz; sunucu tarafı paylaşımlı cache'ten okur, CDN tekrarları karşılar.
 */
async function fetchHomeHubMatches(selectedDate: string, queryClient?: QueryClient): Promise<HomeHubMatchesData> {
  const res = await fetch(`/api/matches/day?date=${encodeURIComponent(selectedDate)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as HomeDayPayload & { stale?: boolean };
  // Kupa maçı varsa kademe haritası listeyle BİRLİKTE gelsin: rozet sonradan eklenince sağa yaslı ev sahibi hücresinde
  // logo/adı sola itiyordu (yatay kayma). Harita 24 sa cache'li; hata listeyi bekletmez/düşürmez.
  if (queryClient && [...body.fixtureMatches, ...body.liveMatches].some((m) => isTurkishCupMatch(m))) {
    await queryClient
      .ensureQueryData({ queryKey: TURKEY_TEAM_TIERS_QUERY_KEY, queryFn: fetchTurkeyTeamTiers, staleTime: TURKEY_TEAM_TIERS_STALE_MS })
      .catch(() => null);
  }
  return {
    // Sportmonks'ta günün geçmişi ile fikstürü aynı liste (tek istek); eski sağlayıcıda ayrı gelir.
    allMatches: body.historyMatches ?? body.fixtureMatches,
    liveMatches: body.liveMatches,
    fixtureMatches: body.fixtureMatches,
    stale: Boolean(body.stale),
  };
}

export function homeHubMatchesQueryKey(selectedDate: string) {
  return ['home-hub-matches', selectedDate] as const;
}

/**
 * Polling: canlı maç varken ya da bir maçın başlamasına ±15 dk kala 30 sn, diğer zamanlarda 5 dk;
 * ardışık hatalarda üstel bekleme. Sekme gizliyken durur (`refetchIntervalInBackground: false`),
 * sekmeye dönünce veri eskiyse bir kez tazelenir.
 */
export function homeHubRefetchInterval(query: Query<HomeHubMatchesData, Error, HomeHubMatchesData, readonly unknown[]>): number {
  const data = query.state.data;
  return homePollDelayMs([...(data?.liveMatches ?? []), ...(data?.fixtureMatches ?? [])], query.state.fetchFailureCount);
}

export function useHomeHubMatches(selectedDate: string, enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: homeHubMatchesQueryKey(selectedDate),
    queryFn: () => fetchHomeHubMatches(selectedDate, queryClient),
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: homeHubRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(5_000 * 2 ** attempt, 60_000),
  });
}

export function prefetchHomeHubMatches(queryClient: QueryClient, selectedDate: string) {
  return queryClient.prefetchQuery({
    queryKey: homeHubMatchesQueryKey(selectedDate),
    queryFn: () => fetchHomeHubMatches(selectedDate, queryClient),
    staleTime: 30_000,
  });
}

/**
 * Seçili günde maç yokken liglerin sıradaki maç günleri (`/api/matches/upcoming-days`). `leagueIds` null = "Tümü"
 * (planımızdaki bütün ligler); doluysa yalnız o ligler (sıralı → aynı seçim aynı anahtar / CDN girdisi).
 */
export function upcomingMatchDaysQueryKey(from: string, leagueIds: ReadonlySet<number> | null = null) {
  return ['upcoming-match-days', from, leagueIds ? [...leagueIds].sort((a, b) => a - b).join(',') : 'all'] as const;
}

export function useUpcomingMatchDays(from: string, leagueIds: ReadonlySet<number> | null, enabled: boolean) {
  const queryKey = upcomingMatchDaysQueryKey(from, leagueIds);
  const leaguesParam = queryKey[2];
  return useQuery({
    queryKey,
    queryFn: async (): Promise<UpcomingLeagueDay[]> => {
      const qs = new URLSearchParams({ from });
      if (leaguesParam !== 'all') qs.set('leagues', leaguesParam);
      const res = await fetch(`/api/matches/upcoming-days?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { leagues: UpcomingLeagueDay[] }).leagues;
    },
    enabled: enabled && leaguesParam !== '',
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
