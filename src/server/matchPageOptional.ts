/**
 * Maç sayfası SSR'ının isteğe bağlı bölümleri: maç kartı H2H + form (`loadMatchCardH2h`: `fixtures/head-to-head` Fixture
 * havuzundan, iki takım formu Team havuzundan) ve Genel Bakış tohumu (istatistik + kadro). Sayfa tohumu normalde maçı çözen
 * tek `fixtures/{id}` yanıtından verir (ek istek yok; bkz. pages/matches/[slug].tsx); `loadMatchDetailSeed` yalnız yedek.
 *
 * Fixture havuzu baskı altındaysa (kalan < %10 ya da 429 soğuması; bkz. server/sportmonks/poolGuard.ts) bu bölümler
 * sunucuda HİÇ çekilmez: `undefined` döner → istemci mevcut yolla tarayıcıdan (CDN önbellekli proxy) çeker, sayfa CDN'de
 * kısa tutulur (eksik render). Havuz normalken davranış aynı. Karar verilemezse (hata) normal yol.
 */
import type { Match } from '@/models/liveScore';
import type { Head2HeadData } from '@/services/liveScoreService';
import { loadMatchCardH2h } from '@/server/matchCardH2h';
import { loadMatchDetailSeed, type MatchDetailServerSeed } from '@/server/matchDetailSeed';
import { isPoolUnderPressure, poolForPath } from '@/server/sportmonks/poolGuard';

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
};

const SKIPPED: MatchPageOptionalSections = { h2h: undefined, seed: { stats: undefined, lineups: undefined }, skipped: true };

export const defaultMatchPageOptionalDeps: MatchPageOptionalDeps = {
  loadH2h: loadMatchCardH2h,
  loadSeed: loadMatchDetailSeed,
  underPressure: () => isPoolUnderPressure(poolForPath('football/fixtures'), Date.now()),
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
  // Bir bölüm hata verirse yalnız o bölüm istemciye kalır (undefined); sayfa çizilir, kopya kısa saklanır.
  let failed = false;
  const [h2h, seed] = await Promise.all([
    deps.loadH2h(match).catch(() => {
      failed = true;
      return undefined;
    }),
    deps.loadSeed(matchId).catch((): MatchDetailServerSeed => {
      failed = true;
      return { stats: undefined, lineups: undefined };
    }),
  ]);
  const { failed: seedFailed, ...seedData } = seed ?? { stats: undefined, lineups: undefined };
  return { h2h, seed: seedData, skipped: false, ...(failed || seedFailed ? { transientError: true } : {}) };
}
