import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  getLeagueTable,
  getTopDisciplinary,
  getTopScorers,
} from '@/services/liveScoreService';

export type StandingsPageData = {
  table: unknown[];
  scorers: unknown[];
  cards: unknown[];
};

async function fetchStandingsPage(competitionId: string): Promise<StandingsPageData> {
  const [tableData, scorersData, cardsData] = await Promise.all([
    getLeagueTable(competitionId),
    getTopScorers(competitionId),
    getTopDisciplinary(competitionId),
  ]);
  return {
    table: (tableData || []) as unknown[],
    scorers: (scorersData?.topscorers ?? []) as unknown[],
    cards: (cardsData || []) as unknown[],
  };
}

export function standingsPageQueryKey(competitionId: string) {
  return ['standings-page', competitionId] as const;
}

export function useStandingsPage(competitionId = '6') {
  return useQuery({
    queryKey: standingsPageQueryKey(competitionId),
    queryFn: () => fetchStandingsPage(competitionId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function prefetchStandingsPage(queryClient: QueryClient, competitionId = '6') {
  return queryClient.prefetchQuery({
    queryKey: standingsPageQueryKey(competitionId),
    queryFn: () => fetchStandingsPage(competitionId),
    staleTime: 60_000,
  });
}
