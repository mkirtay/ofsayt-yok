import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import {
  getAllLiveMatches,
  getAllMatchesByDate,
  getFixturesByDate,
} from '@/services/liveScoreService';

export type HomeHubMatchesData = {
  allMatches: Match[];
  liveMatches: Match[];
  fixtureMatches: Match[];
};

async function fetchHomeHubMatches(selectedDate: string): Promise<HomeHubMatchesData> {
  const [allMatches, liveMatches, fixtureMatches] = await Promise.all([
    getAllMatchesByDate(selectedDate, 5),
    getAllLiveMatches(),
    getFixturesByDate(selectedDate),
  ]);
  return { allMatches, liveMatches, fixtureMatches };
}

export function homeHubMatchesQueryKey(selectedDate: string) {
  return ['home-hub-matches', selectedDate] as const;
}

export function useHomeHubMatches(selectedDate: string, enabled = true) {
  return useQuery({
    queryKey: homeHubMatchesQueryKey(selectedDate),
    queryFn: () => fetchHomeHubMatches(selectedDate),
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function prefetchHomeHubMatches(queryClient: QueryClient, selectedDate: string) {
  return queryClient.prefetchQuery({
    queryKey: homeHubMatchesQueryKey(selectedDate),
    queryFn: () => fetchHomeHubMatches(selectedDate),
    staleTime: 30_000,
  });
}

export async function refreshHomeHubLiveFixtures(
  queryClient: QueryClient,
  selectedDate: string
) {
  const [liveMatches, fixtureMatches] = await Promise.all([
    getAllLiveMatches(),
    getFixturesByDate(selectedDate),
  ]);
  queryClient.setQueryData<HomeHubMatchesData>(
    homeHubMatchesQueryKey(selectedDate),
    (prev) =>
      prev
        ? { ...prev, liveMatches, fixtureMatches }
        : { allMatches: [], liveMatches, fixtureMatches }
  );
}
