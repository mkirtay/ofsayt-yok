import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import {
  getAllCompetitionHistoryMatches,
  getAllLiveMatches,
  getFixturesByCompetition,
} from '@/services/liveScoreService';

export type UefaHubMatchesData = {
  liveMatches: Match[];
  uefaCompFixtures: Match[];
  uefaHistory: Match[];
};

async function fetchUefaHubMatches(competitionId: number): Promise<UefaHubMatchesData> {
  const compId = String(competitionId);
  const [liveMatches, uefaCompFixtures, uefaHistory] = await Promise.all([
    getAllLiveMatches(),
    getFixturesByCompetition(compId),
    getAllCompetitionHistoryMatches(compId, { maxPages: 4 }),
  ]);
  return { liveMatches, uefaCompFixtures, uefaHistory };
}

export function uefaHubMatchesQueryKey(competitionId: number) {
  return ['uefa-hub-matches', competitionId] as const;
}

export function useUefaHubMatches(competitionId: number, enabled = true) {
  return useQuery({
    queryKey: uefaHubMatchesQueryKey(competitionId),
    queryFn: () => fetchUefaHubMatches(competitionId),
    enabled: enabled && competitionId > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function prefetchUefaHubMatches(queryClient: QueryClient, competitionId: number) {
  return queryClient.prefetchQuery({
    queryKey: uefaHubMatchesQueryKey(competitionId),
    queryFn: () => fetchUefaHubMatches(competitionId),
    staleTime: 30_000,
  });
}

export async function refreshUefaHubLiveFixtures(
  queryClient: QueryClient,
  competitionId: number
) {
  const compId = String(competitionId);
  const [liveMatches, uefaCompFixtures] = await Promise.all([
    getAllLiveMatches(),
    getFixturesByCompetition(compId),
  ]);
  queryClient.setQueryData<UefaHubMatchesData>(
    uefaHubMatchesQueryKey(competitionId),
    (prev) =>
      prev
        ? { ...prev, liveMatches, uefaCompFixtures }
        : { liveMatches, uefaCompFixtures, uefaHistory: [] }
  );
}
