import type { IncomingMessage } from 'http';
import type { Match } from '@/models/liveScore';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getCompetitionTableFull,
  getSeasonsList,
  getTeamCompetitions,
  getTeamLastMatches,
  getTeamSquads,
  getTopScorers,
  type CompetitionTableData,
  type SeasonListItem,
  type TeamCompetitionRow,
  type TopScorersPayload,
} from '@/services/liveScoreService';
import { livescoreAxiosFromIncomingMessage } from './livescoreInternalAxios';

export type TeamDetailPageServerPayload = {
  lastMatches: Match[];
  competitions: TeamCompetitionRow[];
  selectedCompetitionId: string;
  squad: unknown[];
  table: CompetitionTableData | null;
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  topScorers: TopScorersPayload | null;
};

export async function loadTeamDetailInitialData(
  req: IncomingMessage,
  teamId: string
): Promise<TeamDetailPageServerPayload | null> {
  try {
    const client = livescoreAxiosFromIncomingMessage(req);
    return await runWithLiveScoreHttpClient(client, async () => {
      const matchesData = await getTeamLastMatches(teamId);
      const comps = getTeamCompetitions(matchesData, teamId);
      const selectedCompetitionId =
        comps.length > 0 ? String(comps[0]!.id) : '';

      let squad: unknown[] = [];
      let table: CompetitionTableData | null = null;
      let seasons: SeasonListItem[] = [];
      let selectedSeasonId: number | null = null;
      let topScorers: TopScorersPayload | null = null;

      if (selectedCompetitionId) {
        const [squadData, seasonsList, table1] = await Promise.all([
          getTeamSquads(teamId, selectedCompetitionId),
          getSeasonsList(),
          getCompetitionTableFull(selectedCompetitionId),
        ]);
        squad = Array.isArray(squadData) ? squadData : [];
        seasons = seasonsList;

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
        selectedSeasonId = sid;

        const needTableRefetch =
          sid != null &&
          table1 != null &&
          (table1.season?.id == null || Number(table1.season.id) !== sid);

        let tableFinal = table1;
        if (needTableRefetch && sid != null) {
          tableFinal = await getCompetitionTableFull(selectedCompetitionId, { season: sid });
        }
        table = tableFinal ?? table1;

        topScorers = await getTopScorers(
          selectedCompetitionId,
          sid != null ? { season: sid } : undefined
        );
      }

      return {
        lastMatches: matchesData,
        competitions: comps,
        selectedCompetitionId,
        squad,
        table,
        seasons,
        selectedSeasonId,
        topScorers,
      };
    });
  } catch (e) {
    console.error('loadTeamDetailInitialData', e);
    return null;
  }
}
