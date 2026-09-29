import type { Match } from '@/models/liveScore';
import type { MatchEvent } from '@/models/domain';
import { prisma } from '@/lib/prisma';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';
import { isUnambiguousSportmonksId } from '@/services/sportmonks/fixtureIdRange';
import {
  findMatchById,
  findMatchByTeamIds,
  getMatchWithEvents,
  lookupSportmonksFixture,
  type SportmonksFixtureLookup,
} from '@/services/liveScoreService';

export type ResolvedLiveMatch = {
  match: Match;
  events: MatchEvent[];
  requestedMatchId: string;
  apiMatchId: string;
};

/** Sportmonks'un "yok" dediği fixture id'leri bu süre boyunca tekrar sorulmaz (bot/crawler tekrarları). */
export const MISSING_FIXTURE_CACHE_TTL_SECONDS = 60 * 60;
/** Belirsiz bölgede (eski livescore id aralığı) "yok" neredeyse her zaman ölü eski URL demek — daha uzun. */
export const MISSING_AMBIGUOUS_FIXTURE_CACHE_TTL_SECONDS = 24 * 60 * 60;

const missingKey = (matchId: string) => `sportmonks:fixture-missing:${matchId}`;

/**
 * Sunucu tarafı Sportmonks maç çözümü; "yok" cevabı negatif cache'lenir (Redis, yoksa in-memory),
 * geçici hatalar cache'lenmez.
 *
 * Belirsiz bölgedeki id'ler (bkz. fixtureIdRange.ts) varsayılan olarak `legacy` döner ve istek
 * atılmaz: analiz/trivia bağlamı ve tahmin değerlendirmesi yalnızca güncel maçlar için anlamlı,
 * aynı id'li eski bir UEFA maçı yanlış bağlam kurmasın. `/matches/[slug]` SSR'ı slug ile karar
 * verebildiği için `lookupAmbiguous: true` geçer.
 */
export async function resolveSportmonksMatch(
  matchId: string,
  opts: { lookupAmbiguous?: boolean } = {},
): Promise<SportmonksFixtureLookup> {
  const ambiguous = !isUnambiguousSportmonksId(matchId);
  if (ambiguous && !opts.lookupAmbiguous) return { kind: 'legacy' };
  if ((await readCache(missingKey(matchId))) != null) return { kind: 'missing' };
  const lookup = await lookupSportmonksFixture(matchId);
  if (lookup.kind === 'missing') {
    await writeCache(
      missingKey(matchId),
      1,
      ambiguous ? MISSING_AMBIGUOUS_FIXTURE_CACHE_TTL_SECONDS : MISSING_FIXTURE_CACHE_TTL_SECONDS,
    );
  }
  return lookup;
}

/** API'de güncellenmiş veya kaldırılmış maç kimlikleri için takım geçmişi + DB ipucu. */
export async function resolveLiveMatch(
  matchId: string,
  opts?: { skipCompetitionFanout?: boolean }
): Promise<ResolvedLiveMatch | null> {
  if (isSportmonksProviderEnabled()) {
    // Sportmonks id'leri kalıcı: `fixtures/{id}` bulamadıysa takım geçmişi taraması da (2× between) bulamaz.
    const lookup = await resolveSportmonksMatch(matchId);
    if (lookup.kind !== 'found') return null;
    return { match: lookup.match, events: lookup.events, requestedMatchId: matchId, apiMatchId: String(lookup.match.id) };
  }

  const direct = await findMatchById(matchId, opts);
  if (direct.match) {
    const apiMatchId = String(direct.match.id);
    let match = direct.match;
    let events = direct.events;
    // Olaylar yalnızca maç fixture listesinden bulunduysa eksik; events endpoint'inden geldiyse boş liste gerçek.
    if (direct.fromFixture) {
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
