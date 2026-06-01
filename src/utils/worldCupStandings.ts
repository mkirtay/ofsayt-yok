import {
  WORLD_CUP_COMPETITION_ID,
  WORLD_CUP_DEFAULT_SEASON_ID,
  pickWorldCupSeasonsFromApi,
} from '@/config/worldCup';
import {
  getCompetitionTableFull,
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
} from '@/services/liveScoreService';

export const WC_COMPETITION_ID_STR = String(WORLD_CUP_COMPETITION_ID);

export function isWorldCupCompetition(compId: number | string | null | undefined): boolean {
  return compId != null && Number(compId) === WORLD_CUP_COMPETITION_ID;
}

export async function fetchWorldCupStandingsBundle(seasonId?: number): Promise<{
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
}> {
  const seasonsList = await getSeasonsList({ skipCalendarYearDedupe: true });
  const wcSeasons = pickWorldCupSeasonsFromApi(seasonsList);
  const selectedSeasonId =
    seasonId ??
    wcSeasons.find((s) => s.id === WORLD_CUP_DEFAULT_SEASON_ID)?.id ??
    wcSeasons[0]?.id ??
    null;

  const standings = await getCompetitionTableFull(
    WC_COMPETITION_ID_STR,
    selectedSeasonId != null ? { season: selectedSeasonId } : undefined,
  );

  return { seasons: wcSeasons, selectedSeasonId, standings };
}
