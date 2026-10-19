/**
 * Maç sayfası SSR'ının isteğe bağlı bölümleri: maç kartı H2H + form (`loadMatchCardH2h`: `fixtures/head-to-head` Fixture
 * havuzundan, iki takım formu Team havuzundan) ve Genel Bakış tohumu (istatistik + kadro). Sayfa tohumu normalde maçı çözen
 * tek `fixtures/{id}` yanıtından verir (ek istek yok; bkz. pages/matches/[slug].tsx); `loadMatchDetailSeed` yalnız yedek.
 *
 * Fixture havuzu baskı altındaysa (kalan < %10 ya da 429 soğuması; bkz. server/sportmonks/poolGuard.ts) bu bölümler
 * sunucuda HİÇ çekilmez: `undefined` döner → istemci mevcut yolla tarayıcıdan (CDN önbellekli proxy) çeker, sayfa CDN'de
 * kısa tutulur (eksik render). Havuz normalken davranış aynı. Karar verilemezse (hata) normal yol.
 *
 * Yalnız-önbellek (`cacheOnly`): ESKİ bitmiş maç (başlama + 3 gün; tarama dalgasının çoğu, H2H bağlantılarından eski
 * sezonlara inen JS'siz bot) ya da havuz rezervde (kalan < %30, bkz. poolGuard.isPoolInReserve) → bölümler Redis'te varsa
 * (aynı takım çiftinin başka sayfası / ziyaretçinin proxy isteği ısıttıysa) verilir, yoksa Sportmonks'a GİDİLMEZ: `undefined`
 * → istemci çeker, sayfa eksik render olarak ≤1 sa saklanır. Önbellekte yok = geçici hata DEĞİL (kısa CDN süresi yok).
 */
import type { Match } from '@/models/liveScore';
import type { Head2HeadData } from '@/services/liveScoreService';
import { loadMatchCardH2h } from '@/server/matchCardH2h';
import { loadMatchDetailSeed, type MatchDetailServerSeed } from '@/server/matchDetailSeed';
import { isPoolInReserve, isPoolUnderPressure, poolForPath } from '@/server/sportmonks/poolGuard';
import { withSportmonksCacheOnly, type SportmonksCacheOnlyState } from '@/server/sportmonks/cachedFetch';
import { matchKickoffMs } from '@/utils/matchActivity';

export type MatchPageOptionalSections = {
  h2h: Head2HeadData | null | undefined;
  seed: MatchDetailServerSeed;
  /** Havuz baskısı yüzünden sunucuda çekilmedi. */
  skipped: boolean;
  /** En az bir bölüm geçici hata verdi (429 / 5xx / zaman aşımı): "veri yok" değil → sayfa CDN'de kısa tutulur. */
  transientError?: boolean;
};

export type MatchPageOptionalDeps = {
  loadH2h: (match: Match) => Promise<Head2HeadData | null | undefined>;
  loadSeed: (matchId: string) => Promise<MatchDetailServerSeed>;
  underPressure: () => Promise<boolean>;
  /** Bölümler yalnız önbellekten (bkz. dosya başı). */
  cacheOnly: (match: Match) => Promise<boolean>;
};

/** Başlamasından bu kadar sonra bitmiş maç "eski": verisi değişmez, ziyareti çoğunlukla tarama. */
export const OLD_MATCH_AGE_MS = 3 * 24 * 60 * 60_000;

export function isOldFinishedMatch(match: Pick<Match, 'status' | 'date' | 'scheduled'>, now: number): boolean {
  if (match.status !== 'FINISHED') return false;
  const k = matchKickoffMs(match);
  return k != null && now - k > OLD_MATCH_AGE_MS;
}

const fixturePool = () => poolForPath('football/fixtures');

const SKIPPED: MatchPageOptionalSections = { h2h: undefined, seed: { stats: undefined, lineups: undefined }, skipped: true };

export const defaultMatchPageOptionalDeps: MatchPageOptionalDeps = {
  loadH2h: loadMatchCardH2h,
  loadSeed: loadMatchDetailSeed,
  underPressure: () => isPoolUnderPressure(fixturePool(), Date.now()),
  cacheOnly: async (match) => isOldFinishedMatch(match, Date.now()) || isPoolInReserve(fixturePool(), Date.now()),
};

export async function loadMatchPageOptionalSections(
  match: Match,
  matchId: string,
  deps: MatchPageOptionalDeps = defaultMatchPageOptionalDeps,
): Promise<MatchPageOptionalSections> {
  let skip = false;
  try {
    skip = await deps.underPressure();
  } catch {
    skip = false;
  }
  if (skip) return SKIPPED;
  let cacheOnly = false;
  try {
    cacheOnly = await deps.cacheOnly(match);
  } catch {
    cacheOnly = false;
  }
  // Bölüm başına ayrı sayaç: önbellekte olmadığı için düşen bölüm geçici hata sayılmaz (yalnız istemciye kalır).
  const h2hScope: SportmonksCacheOnlyState = { misses: 0 };
  const seedScope: SportmonksCacheOnlyState = { misses: 0 };
  const run = <T>(scope: SportmonksCacheOnlyState, fn: () => Promise<T>) => (cacheOnly ? withSportmonksCacheOnly(scope, fn) : fn());
  // Bir bölüm hata verirse yalnız o bölüm istemciye kalır (undefined); sayfa çizilir, kopya kısa saklanır.
  let failed = false;
  const [h2h, seed] = await Promise.all([
    run(h2hScope, () => deps.loadH2h(match)).catch(() => {
      if (h2hScope.misses === 0) failed = true;
      return undefined;
    }),
    run(seedScope, () => deps.loadSeed(matchId)).catch((): MatchDetailServerSeed => {
      if (seedScope.misses === 0) failed = true;
      return { stats: undefined, lineups: undefined };
    }),
  ]);
  const { failed: seedFailedRaw, ...seedData } = seed ?? { stats: undefined, lineups: undefined };
  const seedFailed = seedFailedRaw && seedScope.misses === 0;
  return { h2h, seed: seedData, skipped: false, ...(failed || seedFailed ? { transientError: true } : {}) };
}
