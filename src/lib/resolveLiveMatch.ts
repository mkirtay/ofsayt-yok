import type { Match } from '@/models/liveScore';
import type { MatchEvent } from '@/models/domain';
import { prisma } from '@/lib/prisma';
import {
  findMatchById,
  findMatchByTeamIds,
  getMatchWithEvents,
} from '@/services/liveScoreService';

export type ResolvedLiveMatch = {
  match: Match;
  events: MatchEvent[];
  requestedMatchId: string;
  apiMatchId: string;
};

/** API'de güncellenmiş veya kaldırılmış maç kimlikleri için takım geçmişi + DB ipucu. */
export async function resolveLiveMatch(
  matchId: string
): Promise<ResolvedLiveMatch | null> {
  const direct = await findMatchById(matchId);
  if (direct.match) {
    const apiMatchId = String(direct.match.id);
    let match = direct.match;
    let events = direct.events;
    if (!events.length && apiMatchId !== matchId) {
      const ev = await getMatchWithEvents(apiMatchId);
      if (ev.match) {
        match = ev.match;
        events = ev.events;
      }
    } else if (!events.length) {
      const ev = await getMatchWithEvents(apiMatchId);
      events = ev.events;
      if (ev.match) match = ev.match;
    }
    return { match, events, requestedMatchId: matchId, apiMatchId };
  }

  const analysis = await prisma.matchAnalysis.findFirst({
    where: { matchId },
    select: { homeTeamId: true, awayTeamId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!analysis?.homeTeamId || !analysis?.awayTeamId) return null;

  const found = await findMatchByTeamIds(analysis.homeTeamId, analysis.awayTeamId, {
    nearDate: analysis.createdAt,
  });
  if (!found) return null;

  const apiMatchId = String(found.id);
  const eventsBundle = await getMatchWithEvents(apiMatchId);
  const match = eventsBundle.match ?? found;
  return {
    match,
    events: eventsBundle.events,
    requestedMatchId: matchId,
    apiMatchId,
  };
}
