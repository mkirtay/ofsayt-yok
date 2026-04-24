import type { IncomingMessage } from 'http';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getAllLiveMatches,
  getAllMatchesByDate,
  getCompetitionTableFull,
  getFixturesByDate,
  getSeasonsList,
  getTopScorers,
} from '@/services/liveScoreService';
import type { MatchHubHomeInitialServerPayload } from '@/types/matchHubHomeSsr';
import { livescoreAxiosFromIncomingMessage } from './livescoreInternalAxios';

export async function loadMatchHubHomeInitialData(
  req: IncomingMessage,
  competitionId: number,
  isoDate: string
): Promise<MatchHubHomeInitialServerPayload | null> {
  try {
    const client = livescoreAxiosFromIncomingMessage(req);
    return await runWithLiveScoreHttpClient(client, async () => {
      const compId = String(competitionId);
      const dateParam = isoDate.trim() || new Date().toISOString().slice(0, 10);

      const [historyAll, liveAll, fixtures, seasonsList, table1] = await Promise.all([
        getAllMatchesByDate(dateParam),
        getAllLiveMatches(),
        getFixturesByDate(dateParam),
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
        selectedDate: dateParam,
        allMatches: historyAll,
        liveMatches: liveAll,
        fixtureMatches: fixtures,
        seasons: seasonsList,
        selectedSeasonId: sid,
        standings: tableFinal ?? table1,
        topScorers: scorersData,
      };
    });
  } catch (e) {
    console.error('loadMatchHubHomeInitialData', e);
    return null;
  }
}
