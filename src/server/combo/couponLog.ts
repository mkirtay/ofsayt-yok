/**
 * Günlük kuponların kaydı ve sonuç takibi. Yazma `ComboCouponLog` tablosuna (migration BEKLEMEDE: docs/migrations-pending/…combo_coupon_log);
 * tablo yoksa sessizce atlanır. Sonuç değerlendirmesi SAF ve salt okunur: bir kupon yalnız TÜM maçları tutarsa tutar; tek ıska anında
 * "tutmadı"; bilinmeyen maç varsa ve ıska yoksa "bekliyor".
 */
import { isMissingTable, type Exec } from '@/server/combo/oddsSnapshot';
import { parseScore, topPickHit, type TopPickKey } from '@/utils/analysisTopPicks';
import type { DailyCoupon, DailyPayload } from '@/server/combo/dailyCoupons';

export const COUPON_UPSERT_SQL = `
INSERT INTO "ComboCouponLog" ("id","day","kind","legs","probability","odds","testData","firstKickoffAt")
VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
ON CONFLICT ("day","kind") DO UPDATE SET
  "legs" = EXCLUDED."legs",
  "probability" = EXCLUDED."probability",
  "odds" = EXCLUDED."odds",
  "testData" = EXCLUDED."testData",
  "firstKickoffAt" = EXCLUDED."firstKickoffAt",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "ComboCouponLog"."settledAt" IS NULL
  AND ("ComboCouponLog"."firstKickoffAt" IS NULL OR "ComboCouponLog"."firstKickoffAt" > CURRENT_TIMESTAMP)`;

let seq = 0;
const newId = () => `ccl_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function firstKickoff(c: DailyCoupon): Date | null {
  const times = c.legs.map((l) => (l.kickoffIso ? Date.parse(l.kickoffIso) : NaN)).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)) : null;
}

/** Üretilmiş kuponları kaydeder (yalnız `ok`); tablo yoksa `skipped: 'no-table'`. */
export async function saveCouponLog(exec: Exec, payload: DailyPayload): Promise<{ written: number; skipped?: 'no-table' }> {
  if (payload.status !== 'ok') return { written: 0 };
  let written = 0;
  for (const c of payload.coupons) {
    try {
      await exec(COUPON_UPSERT_SQL, [newId(), payload.date, c.kind, JSON.stringify(c.legs), c.probability, c.odds, payload.testData, firstKickoff(c)]);
      written += 1;
    } catch (error) {
      if (isMissingTable(error)) return { written, skipped: 'no-table' };
      throw error;
    }
  }
  return { written };
}

export type LegOutcome = { score: string | null; extendedHits?: Record<string, boolean | null> | null } | null | undefined;
export type CouponResult = { status: 'pending' | 'hit' | 'miss'; legHits: Array<boolean | null> };

/** Kupon sonucu: `outcomes` maç kimliği → bitmiş maçın skoru / ilk yarı isabetleri (PredictionRecord'tan). Salt okunur, saf. */
export function evaluateCoupon(legs: ReadonlyArray<{ matchId: string; key: TopPickKey; pct: number }>, outcomes: ReadonlyMap<string, LegOutcome>): CouponResult {
  const legHits = legs.map((l) => {
    const o = outcomes.get(l.matchId);
    if (!o) return null;
    return topPickHit({ key: l.key, pct: l.pct }, parseScore(o.score), o.extendedHits ?? null);
  });
  if (legHits.some((h) => h === false)) return { status: 'miss', legHits };
  if (legHits.length > 0 && legHits.every((h) => h === true)) return { status: 'hit', legHits };
  return { status: 'pending', legHits };
}

/** Birkaç kuponun özeti (takip): tutan / tutmayan / bekleyen sayıları ve tutan kuponların oranıyla düz 1 birim kâr. */
export function summarizeCouponResults(items: ReadonlyArray<{ odds: number | null; result: CouponResult }>) {
  const settled = items.filter((i) => i.result.status !== 'pending');
  const hits = settled.filter((i) => i.result.status === 'hit');
  const withOdds = settled.filter((i) => i.odds != null);
  const profit = withOdds.reduce((s, i) => s + (i.result.status === 'hit' ? (i.odds as number) - 1 : -1), 0);
  return {
    total: items.length,
    pending: items.length - settled.length,
    settled: settled.length,
    hits: hits.length,
    hitRate: settled.length ? Math.round((hits.length / settled.length) * 1000) / 1000 : null,
    profit: Math.round(profit * 1000) / 1000,
    profitCoupons: withOdds.length,
  };
}
