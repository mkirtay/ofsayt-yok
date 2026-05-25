import type { IncomingMessage } from 'http';
import {
  pickWorldCupSeasonsFromApi,
  sortWorldCupGroupsByName,
  WORLD_CUP_COMPETITION_ID,
  WORLD_CUP_DEFAULT_SEASON_ID,
} from '@/config/worldCup';
import type {
  CompetitionGroupItem,
  CompetitionTableData,
  GroupedLeagueMatches,
  SeasonListItem,
} from '@/services/liveScoreService';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getAllCompetitionHistoryMatches,
  getCompetitionGroupFixtures,
  getCompetitionTableFull,
  getSeasonsList,
  mergeFixturesWithHistoryAndLive,
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
  groupMatches: GroupedLeagueMatches[];
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

      // Fetch all group fixtures + current-season history in parallel
      const [historyMatches, ...groupFixtureLists] = await Promise.all([
        getAllCompetitionHistoryMatches(WORLD_CUP_ID, {
          maxPages: 10,
          season_id: defaultSeasonId ?? WORLD_CUP_DEFAULT_SEASON_ID,
        }),
        ...groupsFromTable.map((g) => getCompetitionGroupFixtures(WORLD_CUP_ID, g.id)),
      ]);

      const groupMatches: GroupedLeagueMatches[] = groupsFromTable
        .map((group, i) => {
          const fixtures = groupFixtureLists[i] ?? [];
          const merged = mergeFixturesWithHistoryAndLive(fixtures, historyMatches, []);
          return {
            competition_id: Number(group.id),
            competition_name: `Group ${group.name}`,
            matches: merged.sort((a, b) => {
              const ak = `${a.date || ''} ${a.scheduled || a.time || ''}`.trim();
              const bk = `${b.date || ''} ${b.scheduled || b.time || ''}`.trim();
              return ak.localeCompare(bk);
            }),
          } as GroupedLeagueMatches;
        })
        .filter((g) => g.matches.length > 0);

      return {
        tableData: table,
        seasons: wcSeasons,
        selectedSeasonId: defaultSeasonId,
        selectedGroupId,
        groupMatches,
      };
    });
  } catch (e) {
    console.error('loadWorldCupBootstrapData', e);
    return null;
  }
}
