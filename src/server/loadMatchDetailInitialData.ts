import type { IncomingMessage } from 'http';
import type { MatchEvent, MatchStatsData } from '@/models/domain';
import type { Match } from '@/models/liveScore';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { resolveLiveMatch } from '@/lib/resolveLiveMatch';
import {
  getCompetitionTableFull,
  getMatchLineups,
  getMatchStats,
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
} from '@/services/liveScoreService';
import { fetchWorldCupStandingsBundle, isWorldCupCompetition } from '@/utils/worldCupStandings';
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
      const resolved = await resolveLiveMatch(matchId);
      if (!resolved) return null;

      const apiMatchId = resolved.apiMatchId;
      const [lineupsData, statsData] = await Promise.all([
        getMatchLineups(apiMatchId),
        getMatchStats(apiMatchId),
      ]);

      const m = resolved.match;

      const compId = m.competition?.id ?? m.competition_id;

      if (compId == null) {
        return {
          match: m,
          events: resolved.events,
          lineups: lineupsData,
          stats: statsData,
          seasons: [],
          selectedSeasonId: null,
          standings: null,
        };
      }

      const compIdStr = String(compId);

      if (isWorldCupCompetition(compId)) {
        const wc = await fetchWorldCupStandingsBundle();
        return {
          match: m,
          events: resolved.events,
          lineups: lineupsData,
          stats: statsData,
          seasons: wc.seasons,
          selectedSeasonId: wc.selectedSeasonId,
          standings: wc.standings,
        };
      }

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
        events: resolved.events,
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
