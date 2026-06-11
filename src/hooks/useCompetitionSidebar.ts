import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  getCompetitionTableFull,
  getSeasonsList,
  getTopScorers,
  type CompetitionTableData,
  type SeasonListItem,
  type TopScorersPayload,
} from '@/services/liveScoreService';

export type CompetitionSidebarData = {
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
  topScorers: TopScorersPayload | null;
};

async function fetchCompetitionSidebar(competitionId: number): Promise<CompetitionSidebarData> {
  const compId = String(competitionId);
  const [seasonsList, table1] = await Promise.all([
    getSeasonsList(),
    getCompetitionTableFull(compId),
  ]);

  const fromTable =
    table1?.season?.id != null && Number.isFinite(Number(table1.season.id))
      ? Number(table1.season.id)
      : null;
  let sid: number | null = fromTable;
  if (sid != null && seasonsList.length && !seasonsList.some((s) => s.id === sid)) {
    sid = seasonsList[0]!.id;
  } else if (sid == null && seasonsList.length) {
    sid = seasonsList[0]!.id;
  }

  const needTableRefetch =
    sid != null &&
    table1 != null &&
    (table1.season?.id == null || Number(table1.season.id) !== sid);

  let tableFinal = table1;
  if (needTableRefetch && sid != null) {
    tableFinal = await getCompetitionTableFull(compId, { season: sid });
  }

  const scorersData = await getTopScorers(compId, sid != null ? { season: sid } : undefined);

  return {
    seasons: seasonsList,
    selectedSeasonId: sid,
    standings: tableFinal ?? table1,
    topScorers: scorersData,
  };
}

export function competitionSidebarQueryKey(competitionId: number) {
  return ['competition-sidebar', competitionId] as const;
}

export function useCompetitionSidebar(competitionId: number, enabled = true) {
  return useQuery({
    queryKey: competitionSidebarQueryKey(competitionId),
    queryFn: () => fetchCompetitionSidebar(competitionId),
    enabled: enabled && competitionId > 0,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export async function prefetchCompetitionSidebar(
  queryClient: QueryClient,
  competitionId: number
) {
  await queryClient.prefetchQuery({
    queryKey: competitionSidebarQueryKey(competitionId),
    queryFn: () => fetchCompetitionSidebar(competitionId),
    staleTime: 5 * 60_000,
  });
}

export async function fetchCompetitionSidebarForSeason(
  competitionId: number,
  seasonId: number
): Promise<Pick<CompetitionSidebarData, 'standings' | 'topScorers'>> {
  const compId = String(competitionId);
  const [tableData, scorersData] = await Promise.all([
    getCompetitionTableFull(compId, { season: seasonId }),
    getTopScorers(compId, { season: seasonId }),
  ]);
  return { standings: tableData, topScorers: scorersData };
}
