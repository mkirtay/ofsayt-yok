import type { IncomingMessage } from 'http';
import type { Match } from '@/models/liveScore';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getLeagueTable,
  getTeamCompetitions,
  getTeamLastMatches,
  getTeamSquads,
} from '@/services/liveScoreService';
import { livescoreAxiosFromIncomingMessage } from './livescoreInternalAxios';

export type TeamDetailPageServerPayload = {
  lastMatches: Match[];
  competitions: Array<{ id: number; name: string }>;
  selectedCompetitionId: string;
  squad: unknown[];
  table: unknown;
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
      let table: unknown = null;
      if (selectedCompetitionId) {
        const [squadData, tableData] = await Promise.all([
          getTeamSquads(teamId, selectedCompetitionId),
          getLeagueTable(selectedCompetitionId),
        ]);
        squad = Array.isArray(squadData) ? squadData : [];
        table = tableData;
      }

      return {
        lastMatches: matchesData,
        competitions: comps,
        selectedCompetitionId,
        squad,
        table,
      };
    });
  } catch (e) {
    console.error('loadTeamDetailInitialData', e);
    return null;
  }
}
