import {
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';
import {
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
  type TopScorersPayload,
} from '@/services/liveScoreService';
import { legacyToStandingsLeagueId } from '@/services/sportmonksProviderFlag';
import { getCompetitionStandings } from '@/services/competitionStandings';

/**
 * Yan panelin varsayılan görünümü (Puan Durumu): sezon listesi + seçili sezon + tablo. Gol krallığı bu sorguda
 * YOK — gizli sekme olduğu halde her açılışta 4 sayfa çekiliyordu; artık sekme açılınca `useCompetitionTopScorers`.
 * Sunucu (ana sayfa ISR'ı, `server/homeInitialData.ts`) ve tarayıcı aynı `loadCompetitionSidebar`'ı kullanır.
 */
export type CompetitionSidebarData = {
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
};

const EMPTY_SIDEBAR: CompetitionSidebarData = { seasons: [], selectedSeasonId: null, standings: null };

/** Yan panel legacy id (config/leagues.ts) kullanır → puan durumu servisleri için Sportmonks `league_id`. */
function sidebarStandingsLeagueId(competitionId: number): string | null {
  const id = legacyToStandingsLeagueId(competitionId);
  return id == null ? null : String(id);
}

export async function loadCompetitionSidebar(competitionId: number): Promise<CompetitionSidebarData> {
  const compId = sidebarStandingsLeagueId(competitionId);
  if (compId == null) return EMPTY_SIDEBAR;
  const [seasonsList, table1] = await Promise.all([
    getSeasonsList({ competitionId: compId }),
    getCompetitionStandings(compId),
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
    tableFinal = await getCompetitionStandings(compId, { season: sid });
  }

  return {
    seasons: seasonsList,
    selectedSeasonId: sid,
    standings: tableFinal ?? table1,
  };
}

export const COMPETITION_SIDEBAR_STALE_MS = 5 * 60_000;

export function competitionSidebarQueryKey(competitionId: number) {
  return ['competition-sidebar', competitionId] as const;
}

export function useCompetitionSidebar(competitionId: number, enabled = true) {
  return useQuery({
    queryKey: competitionSidebarQueryKey(competitionId),
    queryFn: () => loadCompetitionSidebar(competitionId),
    enabled: enabled && competitionId > 0,
    staleTime: COMPETITION_SIDEBAR_STALE_MS,
    gcTime: 15 * 60_000,
  });
}

export async function prefetchCompetitionSidebar(
  queryClient: QueryClient,
  competitionId: number
) {
  await queryClient.prefetchQuery({
    queryKey: competitionSidebarQueryKey(competitionId),
    queryFn: () => loadCompetitionSidebar(competitionId),
    staleTime: COMPETITION_SIDEBAR_STALE_MS,
  });
}

/** Sezon seçicisi: seçilen sezonun puan durumu (gol krallığı sezon id'si değişince kendi sorgusuyla gelir). */
export async function fetchCompetitionStandingsForSeason(
  competitionId: number,
  seasonId: number
): Promise<CompetitionTableData | null> {
  const compId = sidebarStandingsLeagueId(competitionId);
  if (compId == null) return null;
  return getCompetitionStandings(compId, { season: seasonId });
}

/**
 * Gol Krallığı sekmesi: yalnızca sekme açıkken (`enabled`) çekilir. `seasonId` null → güncel sezon.
 */
export function useCompetitionTopScorers(competitionId: number, seasonId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['competition-topscorers', competitionId, seasonId ?? 'current'] as const,
    queryFn: async (): Promise<TopScorersPayload | null> => {
      const compId = sidebarStandingsLeagueId(competitionId);
      if (compId == null) return null;
      // O (oynanan maç) yanıta gömülü: takım başına kadro isteği yok (bkz. competitionTopScorers.ts). Modül yalnız
      // sekme açılınca yüklenir (düz import(): ilk yük parçalarına girmez).
      const { getTopScorersWithAppearances } = await import('@/services/competitionTopScorers');
      return getTopScorersWithAppearances(compId, seasonId != null ? { season: seasonId } : undefined);
    },
    enabled: enabled && competitionId > 0,
    staleTime: COMPETITION_SIDEBAR_STALE_MS,
    gcTime: 15 * 60_000,
  });
}
