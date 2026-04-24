import type { IncomingMessage } from 'http';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getAllCompetitionHistoryMatches,
  getAllLiveMatches,
  getCompetitionTableFull,
  getFixturesByCompetition,
  getSeasonsList,
  getTopScorers,
} from '@/services/liveScoreService';
import type { UefaHubInitialServerPayload } from '@/types/uefaHubSsr';
import { livescoreAxiosFromIncomingMessage } from './livescoreInternalAxios';

export async function loadUefaHubInitialData(
  req: IncomingMessage,
  competitionId: number
): Promise<UefaHubInitialServerPayload | null> {
  try {
    const client = livescoreAxiosFromIncomingMessage(req);
    return await runWithLiveScoreHttpClient(client, async () => {
      const compId = String(competitionId);
      const [liveMatches, uefaCompFixtures, uefaHistory, seasonsList, table1] =
        await Promise.all([
          getAllLiveMatches(),
          getFixturesByCompetition(compId),
          getAllCompetitionHistoryMatches(compId, { maxPages: 4 }),
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

      const scorersData = await getTopScorers(
        compId,
        sid != null ? { season: sid } : undefined
      );

      return {
        competitionId,
        liveMatches,
        uefaCompFixtures,
        uefaHistory,
        seasons: seasonsList,
        selectedSeasonId: sid,
        standings: tableFinal ?? table1,
        topScorers: scorersData,
      };
    });
  } catch (e) {
    console.error('loadUefaHubInitialData', e);
    return null;
  }
}
