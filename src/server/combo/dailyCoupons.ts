/**
 * Günlük otomatik kuponlar: havuz (config/comboPool.ts) ∩ analizi olanlar → üç hazır öneri (Garantici ~1,7 / Dengeli / Riskli).
 * Kullanıcıdan girdi istenmez. Yeterli analizli maç ya da yeterince güçlü pick YOKSA kupon ZORLANMAZ ("yeterli veri yok").
 * Sonuç günlük Redis önbelleğinde (DB gerekmez); cron üretir, ana sayfa kartı okur. Geliştirmede test analizleri varsa eşikler
 * gevşetilir ve bu `thresholdRelaxed` ile açıkça işaretlenir.
 */
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { fitsInRedis, withRedis } from '@/lib/redis';
import { loadComboCandidates, type ComboCandidateRow } from '@/server/combo/candidates';
import { resolveOdds, type OddsResult } from '@/server/combo/afOdds';
import { straightOutcome, riskToTargetOdds, suggestForRisk } from '@/utils/comboPlan';
import type { TopPickKey } from '@/utils/analysisTopPicks';

export type CouponKind = 'safe' | 'balanced' | 'bold';

/** Üretimdeki kural: kind başına risk %, en çok maç, pazar başına olasılık tabanı (altına inilmez). */
export const COUPON_KINDS: ReadonlyArray<{ kind: CouponKind; risk: number; maxMatches: number; floor: number }> = [
  { kind: 'safe', risk: 0, maxMatches: 3, floor: 70 },
  { kind: 'balanced', risk: 50, maxMatches: 4, floor: 62 },
  { kind: 'bold', risk: 100, maxMatches: 6, floor: 55 },
];
/** Test (geliştirme + test analizi) için gevşetilmiş taban. */
export const TEST_FLOOR = 40;
/** Bu kadar analizli havuz maçı yoksa hiç kupon üretilmez. */
export const MIN_ANALYSED_MATCHES = 3;

export type DailyLeg = {
  matchId: string;
  homeName: string;
  awayName: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  kickoffIso: string | null;
  key: TopPickKey;
  pct: number;
  odd: number | null;
  national: boolean;
  source: 'db' | 'test';
};

export type DailyCoupon = {
  kind: CouponKind;
  legs: DailyLeg[];
  /** Kombine olasılık (0–1, model). */
  probability: number;
  /** Kombine yaklaşık oran; herhangi bir maçın oranı yoksa null. */
  odds: number | null;
  breakEven: number | null;
  /** Hedef orana ulaşmak için eşik taban değere kadar çekildi mi. */
  relaxed: boolean;
};

export type DailyPayload = {
  date: string;
  generatedAt: string;
  status: 'ok' | 'insufficient';
  reason?: 'few-analyses' | 'no-strong-picks';
  /** Havuzdaki (analizli) aday sayısı. */
  analysed: number;
  coupons: DailyCoupon[];
  /** Kuponlarda test verisi (kayıtlı olmayan analiz) var. */
  testData: boolean;
  /** Eşikler üretimdekinden gevşetildi (yalnız test). */
  thresholdRelaxed: boolean;
};

export type BuildDeps = {
  candidates?: typeof loadComboCandidates;
  odds?: typeof resolveOdds;
  now?: number;
};

const toLeg = (c: ComboCandidateRow, odd: number | null): DailyLeg => ({
  matchId: c.matchId,
  homeName: c.homeName,
  awayName: c.awayName,
  homeLogo: c.homeLogo ?? null,
  awayLogo: c.awayLogo ?? null,
  kickoffIso: c.kickoffIso ?? null,
  key: c.key,
  pct: c.pct,
  odd,
  national: c.national,
  source: c.source,
});

export async function buildDailyCoupons(date: string, deps: BuildDeps = {}): Promise<DailyPayload> {
  const now = deps.now ?? Date.now();
  const base = { date, generatedAt: new Date(now).toISOString() };
  const candidates = await (deps.candidates ?? loadComboCandidates)(date, { now });
  const testData = candidates.some((c) => c.source === 'test');
  if (candidates.length < MIN_ANALYSED_MATCHES) {
    return { ...base, status: 'insufficient', reason: 'few-analyses', analysed: candidates.length, coupons: [], testData: false, thresholdRelaxed: false };
  }

  const results = await (deps.odds ?? resolveOdds)(
    candidates.map((c) => ({ matchId: c.matchId, key: c.key, kickoffMs: c.kickoffIso ? Date.parse(c.kickoffIso) : null, home: c.homeName, away: c.awayName })),
  );
  const oddOf = new Map<string, number>(results.flatMap((r: OddsResult) => (r.status === 'ok' ? [[r.matchId, r.market.odd] as const] : [])));
  const pool = candidates.map((c) => ({ ...c, odd: oddOf.get(c.matchId) ?? null }));
  const anyOdds = pool.some((p) => p.odd != null);

  const coupons: DailyCoupon[] = [];
  let thresholdRelaxed = false;
  for (const k of COUPON_KINDS) {
    const floor = testData ? Math.min(k.floor, TEST_FLOOR) : k.floor;
    const target = anyOdds ? riskToTargetOdds(k.risk) : null;
    let res = suggestForRisk(pool, { risk: k.risk, maxMatches: k.maxMatches, targetOdds: target, floor });
    // Hedef orana ulaşılamıyorsa oransız (yalnız olasılık) öneriye düş; yine de tabanın altına inilmez.
    if (res.picks.length === 0 && target != null) res = suggestForRisk(pool, { risk: k.risk, maxMatches: k.maxMatches, targetOdds: null, floor });
    if (res.picks.length === 0) continue;
    const picks = res.picks as typeof pool;
    if (picks.some((p) => p.pct < k.floor)) thresholdRelaxed = true;
    const legs = picks.map((p) => toLeg(p, p.odd));
    const straight = straightOutcome(picks, 1);
    const probability = picks.reduce((acc, p) => (acc * p.pct) / 100, 1);
    coupons.push({ kind: k.kind, legs, probability, odds: straight?.odds ?? null, breakEven: straight?.breakEven ?? null, relaxed: res.relaxed });
  }
  if (coupons.length === 0) return { ...base, status: 'insufficient', reason: 'no-strong-picks', analysed: candidates.length, coupons: [], testData, thresholdRelaxed: false };
  return { ...base, status: 'ok', analysed: candidates.length, coupons, testData, thresholdRelaxed };
}

// ── Redis önbelleği (günlük anahtar, 2 gün) ────────────────────────────────────────────────────────────────────────
const key = (date: string) => `${cacheKeyPrefix()}combo:daily:${date}`;

export async function readDaily(date: string): Promise<DailyPayload | null> {
  return withRedis((r) => r.get<DailyPayload>(key(date)), null);
}

export async function writeDaily(payload: DailyPayload): Promise<void> {
  if (!fitsInRedis(payload)) return;
  await withRedis((r) => r.set(key(payload.date), payload, { ex: 2 * 24 * 60 * 60 }), null);
}

/** "17:30" → dakika; geçersizse 17:30. */
export function parseDailyTime(raw: string | undefined | null): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return 17 * 60 + 30;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : 17 * 60 + 30;
}

export function istanbulMinutes(now: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
}
