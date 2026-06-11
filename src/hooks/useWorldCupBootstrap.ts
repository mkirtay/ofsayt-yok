import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  pickWorldCupSeasonsFromApi,
  WORLD_CUP_COMPETITION_ID,
  WORLD_CUP_DEFAULT_SEASON_ID,
} from '@/config/worldCup';
import {
  getCompetitionTableFull,
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
} from '@/services/liveScoreService';
import { extractGroupsFromTable } from '@/utils/worldCupTable';

const WORLD_CUP_ID = String(WORLD_CUP_COMPETITION_ID);

export type WorldCupBootstrapData = {
  tableData: CompetitionTableData | null;
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  selectedGroupId: number | null;
};

async function fetchWorldCupBootstrap(): Promise<WorldCupBootstrapData> {
  const seasonsList = await getSeasonsList({ skipCalendarYearDedupe: true });
  const wcSeasons = pickWorldCupSeasonsFromApi(seasonsList);

  const defaultSeasonId =
    wcSeasons.find((s) => s.id === WORLD_CUP_DEFAULT_SEASON_ID)?.id ??
    wcSeasons[0]?.id ??
    null;

  const table = await getCompetitionTableFull(
    WORLD_CUP_ID,
    defaultSeasonId != null ? { season: defaultSeasonId } : undefined
  );

  const groupsFromTable = extractGroupsFromTable(table);

  return {
    tableData: table,
    seasons: wcSeasons,
    selectedSeasonId: defaultSeasonId,
    selectedGroupId: groupsFromTable.length ? groupsFromTable[0]!.id : null,
  };
}

export const worldCupBootstrapQueryKey = ['world-cup-bootstrap'] as const;

export function useWorldCupBootstrap() {
  return useQuery({
    queryKey: worldCupBootstrapQueryKey,
    queryFn: fetchWorldCupBootstrap,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

export function prefetchWorldCupBootstrap(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: worldCupBootstrapQueryKey,
    queryFn: fetchWorldCupBootstrap,
    staleTime: 5 * 60_000,
  });
}
