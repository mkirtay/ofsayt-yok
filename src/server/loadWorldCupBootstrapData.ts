import type { IncomingMessage } from 'http';
import {
  pickWorldCupSeasonsFromApi,
  sortWorldCupGroupsByName,
  WORLD_CUP_COMPETITION_ID,
  WORLD_CUP_DEFAULT_SEASON_ID,
} from '@/config/worldCup';
import type { CompetitionGroupItem, CompetitionTableData, SeasonListItem } from '@/services/liveScoreService';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getCompetitionTableFull,
  getSeasonsList,
} from '@/services/liveScoreService';
import { livescoreAxiosFromIncomingMessage } from './livescoreInternalAxios';

const WORLD_CUP_ID = String(WORLD_CUP_COMPETITION_ID);

function extractGroupsFromTable(data: CompetitionTableData | null): CompetitionGroupItem[] {
  if (!data?.stages?.length) return [];
  const raw = data.stages.flatMap((stage) => stage.groups ?? []);
  return sortWorldCupGroupsByName(
    raw
      .map((g): CompetitionGroupItem | null => {
        const id = Number(g?.id);
        const name = String(g?.name ?? '').trim();
        if (!Number.isFinite(id) || !name) return null;
        return { id, name };
      })
      .filter((g): g is CompetitionGroupItem => g != null),
  );
}

export type WorldCupBootstrapServerPayload = {
  tableData: CompetitionTableData | null;
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  selectedGroupId: number | null;
};

export async function loadWorldCupBootstrapData(
  req: IncomingMessage
): Promise<WorldCupBootstrapServerPayload | null> {
  try {
    const client = livescoreAxiosFromIncomingMessage(req);
    return await runWithLiveScoreHttpClient(client, async () => {
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
      const selectedGroupId = groupsFromTable.length ? groupsFromTable[0]!.id : null;

      return {
        tableData: table,
        seasons: wcSeasons,
        selectedSeasonId: defaultSeasonId,
        selectedGroupId,
      };
    });
  } catch (e) {
    console.error('loadWorldCupBootstrapData', e);
    return null;
  }
}
