import type { Match } from '@/models/liveScore';
import type { SportmonksFixtureLookup } from '@/services/liveScoreService';
import { isUnambiguousSportmonksId } from '@/services/sportmonks/fixtureIdRange';
import { matchSlugMatches } from '@/utils/matchUrl';
import { resolveSportmonksMatch } from '@/lib/resolveLiveMatch';
import { findStoredMatchInfo, type StoredMatchInfo } from '@/server/storedMatch';

/**
 * `/matches/[slug]` SSR kararı (Sportmonks).
 * - `match`: gerçek maç sayfası.
 * - `archived`: sağlayıcıda yok ama DB'de saklı içerik var → arşiv görünümü, istemci sağlayıcıya gitmez.
 * - `gone`: 410 — ölü eski URL ya da aynı id'li başka bir maça ait slug.
 * - `missing`: kesin Sportmonks id'si ama Sportmonks "yok" diyor → istemcinin "bulunamadı" akışı.
 * - `error`: geçici hata → cache'lenmez, istemci tekrar dener.
 */
export type MatchPageResolution =
  | { kind: 'match'; match: Match }
  | { kind: 'archived' }
  | { kind: 'gone' }
  | { kind: 'missing' }
  | { kind: 'error' };

export type ResolveMatchPageDeps = {
  findStored: (matchId: string) => Promise<StoredMatchInfo | null>;
  resolve: (matchId: string, opts: { lookupAmbiguous?: boolean }) => Promise<SportmonksFixtureLookup>;
};

const defaultDeps: ResolveMatchPageDeps = { findStored: findStoredMatchInfo, resolve: resolveSportmonksMatch };

/**
 * @param urlSlug URL'de id'den sonraki kısım ("" = slug'sız URL).
 *
 * Belirsiz bölgede (eski livescore id'leri ile eski UEFA sezonlarının Sportmonks id'leri çakışıyor,
 * bkz. fixtureIdRange.ts) URL slug'ı, sitenin o maç için ürettiği slug ile BİREBİR karşılaştırılır
 * (`matchSlugMatches`, bulanık eşleştirme yok):
 * 1. DB'de saklı içerik var → slug takım adlarıyla uyuşuyorsa (ya da ad/slug yoksa) arşiv; uyuşmuyorsa
 *    URL aynı id'li başka bir maça ait olabilir → 2'ye düş.
 * 2. Tek `fixtures/{id}` isteği (negatif cache 24 sa): bulundu + slug uyuşuyor (ya da slug yok) → maç;
 *    bulundu ama slug başka takımların → eski livescore URL'si → 410; yok → 410.
 */
export async function resolveMatchPage(
  matchId: string,
  urlSlug: string,
  deps: ResolveMatchPageDeps = defaultDeps,
): Promise<MatchPageResolution> {
  if (isUnambiguousSportmonksId(matchId)) {
    const lookup = await deps.resolve(matchId, {});
    if (lookup.kind === 'found') return { kind: 'match', match: lookup.match };
    return lookup.kind === 'error' ? { kind: 'error' } : { kind: 'missing' };
  }

  const stored = await deps.findStored(matchId);
  if (stored) {
    const hasNames = Boolean(stored.homeTeamName || stored.awayTeamName);
    if (
      !hasNames ||
      !urlSlug ||
      matchSlugMatches(urlSlug, { home_name: stored.homeTeamName ?? '', away_name: stored.awayTeamName ?? '' })
    ) {
      return { kind: 'archived' };
    }
  }

  const lookup = await deps.resolve(matchId, { lookupAmbiguous: true });
  if (lookup.kind === 'error') return { kind: 'error' };
  if (lookup.kind !== 'found') return { kind: 'gone' };
  if (!urlSlug || matchSlugMatches(urlSlug, lookup.match)) return { kind: 'match', match: lookup.match };
  return { kind: 'gone' };
}
