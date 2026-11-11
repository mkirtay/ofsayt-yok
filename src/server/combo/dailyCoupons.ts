/**
 * Günlük otomatik kuponlar: havuz (config/comboPool.ts) ∩ analizi olanlar → üç hazır öneri (Temkinli / Dengeli / Riskli).
 * Pazarlar YALNIZ toplam gol 1,5 / 2,5 / 3,5 (alt-üst) ve iki takım da gol bulur (var / yok) — comboMarkets.ts.
 * Olasılık = model ile marjı temizlenmiş piyasa olasılığının harmanı (MODEL_WEIGHT); kartta piyasa oranı yerine ADİL oran (1 / olasılık).
 * Kupon türü bacak sayısı + bacak olasılığı aralığıyla tanımlı; maç başına tek bacak; aralığa uyan maç yetmezse o kupon ÜRETİLMEZ
 * (zorlanmaz). Piyasa verisi olmayan maç kupona girmez (kalibrasyonda model tek başına taban oranından iyi değil) — yalnız
 * geliştirmedeki test analizleri istisna. Sonuç günlük Redis önbelleğinde; cron üretir, ana sayfa kartı okur.
 */
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { fitsInRedis, withRedis } from '@/lib/redis';
import { loadComboCandidates, type ComboCandidateRow } from '@/server/combo/candidates';
import { resolveOdds, type ComboMarketsOdds, type OddsResult } from '@/server/combo/afOdds';
import { MODEL_WEIGHT, blendPct, fairOdds, type ComboMarketKey } from '@/utils/comboMarkets';

export type CouponKind = 'safe' | 'balanced' | 'bold';

/**
 * Kupon türleri: bacak sayısı + bacak olasılığı aralığı (harmanlanmış, yüzde). Üst sınır adil oranın tabanıdır
 * (%80 → 1,25; %72 → 1,39; %62 → 1,61) — çok düşük oranlı bacak girmez. Bacak sayısı az: her bacakta oyun sitesinin marjı ödenir.
 */
export const COUPON_KINDS: ReadonlyArray<{ kind: CouponKind; legs: number; minPct: number; maxPct: number }> = [
  { kind: 'safe', legs: 2, minPct: 70, maxPct: 80 },
  { kind: 'balanced', legs: 3, minPct: 60, maxPct: 72 },
  { kind: 'bold', legs: 4, minPct: 50, maxPct: 62 },
];
/** Bu kadar analizli havuz maçı yoksa hiç kupon üretilmez. */
export const MIN_ANALYSED_MATCHES = 3;

export type DailyLeg = {
  matchId: string;
  homeName: string;
  awayName: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  kickoffIso: string | null;
  key: ComboMarketKey;
  /** Harmanlanmış olasılık (yüzde) — kuponun kullandığı. */
  pct: number;
  modelPct: number;
  /** Marjı temizlenmiş piyasa olasılığı; yoksa null (yalnız test verisi). */
  marketPct: number | null;
  /** Adil oran = 1 / pct. */
  fairOdd: number;
  /** Uluslararası referans oranı (Türk sitesi oranı DEĞİL); yoksa null. */
  refOdd: number | null;
  national: boolean;
  source: 'db' | 'test';
};

export type DailyCoupon = {
  kind: CouponKind;
  legs: DailyLeg[];
  /** Kombine olasılık (0–1; maçlar bağımsız varsayılır). */
  probability: number;
  /** Kombine adil oran = 1 / probability. */
  fairOdds: number;
  /** Referans oranların çarpımı; herhangi biri yoksa null. */
  refOdds: number | null;
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
};

export type BuildDeps = {
  candidates?: typeof loadComboCandidates;
  odds?: typeof resolveOdds;
  now?: number;
};

type Option = Omit<DailyLeg, 'matchId' | 'homeName' | 'awayName' | 'homeLogo' | 'awayLogo' | 'kickoffIso' | 'national' | 'source'>;

/** Maçın kupona aday pazarları (harmanlanmış). Piyasa verisi yoksa yalnız test verisinde model tek başına. */
export function matchOptions(c: ComboCandidateRow, markets: ComboMarketsOdds | undefined): Option[] {
  return c.markets.flatMap((m) => {
    const mk = markets?.[m.key];
    if (!mk && c.source !== 'test') return [];
    const pct = blendPct(m.pct, mk?.marketPct ?? null, MODEL_WEIGHT[m.key]);
    return [{ key: m.key, pct, modelPct: m.pct, marketPct: mk?.marketPct ?? null, fairOdd: fairOdds(pct), refOdd: mk?.odd ?? null }];
  });
}

/** Bir kupon türü: her maçtan aralığa uyan en olası pazar; en olası `legs` maç. Yetmezse null (zorlanmaz). */
export function pickCoupon(
  pool: ReadonlyArray<{ row: ComboCandidateRow; options: Option[] }>,
  spec: (typeof COUPON_KINDS)[number],
): DailyCoupon | null {
  const best = pool.flatMap(({ row, options }) => {
    const inBand = options.filter((o) => o.pct >= spec.minPct && o.pct <= spec.maxPct).sort((a, b) => b.pct - a.pct)[0];
    return inBand ? [{ row, o: inBand }] : [];
  });
  if (best.length < spec.legs) return null;
  const chosen = best.sort((a, b) => b.o.pct - a.o.pct || a.row.matchId.localeCompare(b.row.matchId)).slice(0, spec.legs);
  const legs: DailyLeg[] = chosen.map(({ row, o }) => ({
    matchId: row.matchId,
    homeName: row.homeName,
    awayName: row.awayName,
    homeLogo: row.homeLogo ?? null,
    awayLogo: row.awayLogo ?? null,
    kickoffIso: row.kickoffIso ?? null,
    national: row.national,
    source: row.source,
    ...o,
  }));
  const probability = legs.reduce((acc, l) => (acc * l.pct) / 100, 1);
  const refOdds = legs.every((l) => l.refOdd != null) ? Math.round(legs.reduce((acc, l) => acc * (l.refOdd as number), 1) * 100) / 100 : null;
  return { kind: spec.kind, legs, probability, fairOdds: Math.round((1 / probability) * 100) / 100, refOdds };
}

export async function buildDailyCoupons(date: string, deps: BuildDeps = {}): Promise<DailyPayload> {
  const now = deps.now ?? Date.now();
  const base = { date, generatedAt: new Date(now).toISOString() };
  const candidates = await (deps.candidates ?? loadComboCandidates)(date, { now });
  const testData = candidates.some((c) => c.source === 'test');
  if (candidates.length < MIN_ANALYSED_MATCHES) {
    return { ...base, status: 'insufficient', reason: 'few-analyses', analysed: candidates.length, coupons: [], testData: false };
  }

  const results = await (deps.odds ?? resolveOdds)(
    candidates.map((c) => ({ matchId: c.matchId, key: c.key, kickoffMs: c.kickoffIso ? Date.parse(c.kickoffIso) : null, home: c.homeName, away: c.awayName })),
  );
  const marketsOf = new Map<string, ComboMarketsOdds>(results.flatMap((r: OddsResult) => (r.markets ? [[r.matchId, r.markets] as const] : [])));
  const pool = candidates.map((row) => ({ row, options: matchOptions(row, marketsOf.get(row.matchId)) }));

  const coupons = COUPON_KINDS.map((k) => pickCoupon(pool, k)).filter((c): c is DailyCoupon => c != null);
  if (coupons.length === 0) return { ...base, status: 'insufficient', reason: 'no-strong-picks', analysed: candidates.length, coupons: [], testData };
  return { ...base, status: 'ok', analysed: candidates.length, coupons, testData: coupons.some((c) => c.legs.some((l) => l.source === 'test')) };
}

// ── Redis önbelleği (günlük anahtar, 2 gün) ────────────────────────────────────────────────────────────────────────
// v2: kupon biçimi değişti (adil oran, harman). Sürüm, eski biçimli önbelleğin yeni karta gitmesini engeller.
const key = (date: string) => `${cacheKeyPrefix()}combo:daily:v2:${date}`;

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
