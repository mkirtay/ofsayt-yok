import type { Match } from '@/models/liveScore';
import type { MatchEvent } from '@/models/domain';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { isUnambiguousSportmonksId } from '@/services/sportmonks/fixtureIdRange';
import { lookupSportmonksFixture, type SportmonksFixtureLookup } from '@/services/liveScoreService';

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

const missingKey = (matchId: string) => `${cacheKeyPrefix()}sportmonks:fixture-missing:${matchId}`;

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

/**
 * Maçı Sportmonks `fixtures/{id}` ile çözer. Sportmonks id'leri kalıcı: bulunamadıysa takım geçmişi taraması da
 * bulamaz → null.
 */
export async function resolveLiveMatch(matchId: string): Promise<ResolvedLiveMatch | null> {
  const lookup = await resolveSportmonksMatch(matchId);
  if (lookup.kind !== 'found') return null;
  return { match: lookup.match, events: lookup.events, requestedMatchId: matchId, apiMatchId: String(lookup.match.id) };
}
