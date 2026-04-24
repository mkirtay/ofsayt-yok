import type { IncomingMessage } from 'http';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getLeagueTable,
  getTopDisciplinary,
  getTopScorers,
} from '@/services/liveScoreService';
import { livescoreAxiosFromIncomingMessage } from './livescoreInternalAxios';

export type StandingsPageServerPayload = {
  table: unknown[];
  scorers: unknown[];
  cards: unknown[];
};

export async function loadStandingsPageData(
  req: IncomingMessage,
  competitionId: string
): Promise<StandingsPageServerPayload | null> {
  try {
    const client = livescoreAxiosFromIncomingMessage(req);
    return await runWithLiveScoreHttpClient(client, async () => {
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
    });
  } catch (e) {
    console.error('loadStandingsPageData', e);
    return null;
  }
}
