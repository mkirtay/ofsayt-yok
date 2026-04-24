import type { IncomingMessage } from 'http';
import type { MatchEvent, MatchStatsData } from '@/models/domain';
import type { Match } from '@/models/liveScore';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import {
  getCompetitionTableFull,
  getMatchLineups,
  getMatchStats,
  getMatchWithEvents,
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
} from '@/services/liveScoreService';
import { livescoreAxiosFromIncomingMessage } from './livescoreInternalAxios';

export type MatchDetailPageServerPayload = {
  match: Match | null;
  events: MatchEvent[];
  lineups: unknown;
  stats: MatchStatsData | null;
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
};

export async function loadMatchDetailInitialData(
  req: IncomingMessage,
  matchId: string
): Promise<MatchDetailPageServerPayload | null> {
  try {
    const client = livescoreAxiosFromIncomingMessage(req);
    return await runWithLiveScoreHttpClient(client, async () => {
      const [matchEventsRes, lineupsData, statsData] = await Promise.all([
        getMatchWithEvents(matchId),
        getMatchLineups(matchId),
        getMatchStats(matchId),
      ]);

      const m = matchEventsRes.match;
      const compId = m?.competition?.id ?? m?.competition_id;

      if (compId == null) {
        return {
          match: m,
          events: matchEventsRes.events,
          lineups: lineupsData,
          stats: statsData,
          seasons: [],
          selectedSeasonId: null,
          standings: null,
        };
      }

      const compIdStr = String(compId);
      const [seasonsList, table1] = await Promise.all([
        getSeasonsList(),
        getCompetitionTableFull(compIdStr),
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
        tableFinal = await getCompetitionTableFull(compIdStr, { season: sid });
      }

      return {
        match: m,
        events: matchEventsRes.events,
        lineups: lineupsData,
        stats: statsData,
        seasons: seasonsList,
        selectedSeasonId: sid,
        standings: tableFinal ?? table1,
      };
    });
  } catch (e) {
    console.error('loadMatchDetailInitialData', e);
    return null;
  }
}
