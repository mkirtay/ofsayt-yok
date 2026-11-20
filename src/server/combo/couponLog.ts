/**
 * Günlük kuponların kaydı ve sonuç takibi. Yazma `ComboCouponLog` tablosuna (prisma/migrations/20261120120000_combo_coupon_log);
 * tablo yoksa sessizce atlanır. Sonuç değerlendirmesi SAF ve salt okunur: bir kupon yalnız TÜM maçları tutarsa tutar; tek ıska anında
 * "tutmadı"; bilinmeyen maç varsa ve ıska yoksa "bekliyor".
 */
import { isMissingTable, type Exec } from '@/server/combo/oddsSnapshot';
import { parseScore } from '@/utils/analysisTopPicks';
import { comboMarketHit, type ComboMarketKey } from '@/utils/comboMarkets';
import type { DailyCoupon, DailyPayload } from '@/server/combo/dailyCoupons';
import { buildCouponHistory, type CouponHistory } from '@/utils/comboHistory';

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
      await exec(COUPON_UPSERT_SQL, [newId(), payload.date, c.kind, JSON.stringify(c.legs), c.probability, c.refOdds, payload.testData, firstKickoff(c)]);
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
export function evaluateCoupon(legs: ReadonlyArray<{ matchId: string; key: ComboMarketKey }>, outcomes: ReadonlyMap<string, LegOutcome>): CouponResult {
  const legHits = legs.map((l) => {
    const o = outcomes.get(l.matchId);
    if (!o) return null;
    return comboMarketHit(l.key, parseScore(o.score));
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

// ── Sonuçlandırma (gece değerlendirme işi) ─────────────────────────────────────────────────────────────────────────────

export type StoredLeg = { matchId: string; key: ComboMarketKey };
export type OpenCoupon = { id: string; legs: StoredLeg[]; firstKickoffAt: Date | null; legHits: Array<boolean | null> | null };
export type SettleUpdate = { id: string; legHits: Array<boolean | null>; settled: boolean; hit: boolean | null };

/** İlk maçtan bu kadar sonra hâlâ bilinmeyen maç varsa kupon "sonuçlanamadı" (hit=null) diye kapanır (ertelenen / iptal maç). */
export const COUPON_VOID_AFTER_MS = 7 * 24 * 3600_000;

/**
 * Açık kuponların sonucu (saf): tüm maçlar tuttu → kapat, hit; tek ıska → kapat, miss; bilinmeyen varsa açık kalır, ilk maçtan
 * 7 gün sonra hâlâ bilinmeyen varsa ve ıska yoksa hit=null ile kapanır. Yalnız değişen satırlar döner.
 */
export function planCouponSettlement(open: ReadonlyArray<OpenCoupon>, outcomes: ReadonlyMap<string, LegOutcome>, now: number): SettleUpdate[] {
  const out: SettleUpdate[] = [];
  for (const c of open) {
    const r = evaluateCoupon(c.legs, outcomes);
    const stale = c.firstKickoffAt != null && now - c.firstKickoffAt.getTime() > COUPON_VOID_AFTER_MS;
    if (r.status !== 'pending') out.push({ id: c.id, legHits: r.legHits, settled: true, hit: r.status === 'hit' });
    else if (stale) out.push({ id: c.id, legHits: r.legHits, settled: true, hit: null });
    else if (JSON.stringify(r.legHits) !== JSON.stringify(c.legHits ?? [])) out.push({ id: c.id, legHits: r.legHits, settled: false, hit: null });
  }
  return out;
}

export type SettleDeps = {
  /** Sonuçlanmamış, ilk maçı başlamış, test verisi olmayan kuponlar. */
  loadOpen: (now: Date) => Promise<OpenCoupon[]>;
  /** Maç kimliği → değerlendirilmiş skor (PredictionRecord.actualScore). */
  loadOutcomes: (matchIds: string[]) => Promise<Map<string, LegOutcome>>;
  save: (u: SettleUpdate, now: Date) => Promise<void>;
};

function legsOf(raw: unknown): StoredLeg[] {
  return Array.isArray(raw)
    ? raw.flatMap((l) => (l && typeof l === 'object' && typeof (l as StoredLeg).matchId === 'string' && typeof (l as StoredLeg).key === 'string' ? [{ matchId: (l as StoredLeg).matchId, key: (l as StoredLeg).key }] : []))
    : [];
}

async function prismaDeps(): Promise<SettleDeps> {
  const { prisma } = await import('@/lib/prisma');
  return {
    loadOpen: async (now) =>
      (
        await prisma.comboCouponLog.findMany({
          where: { settledAt: null, testData: false, firstKickoffAt: { lt: now } },
          select: { id: true, legs: true, firstKickoffAt: true, legHits: true },
          orderBy: { firstKickoffAt: 'asc' },
          take: 300,
        })
      ).map((r) => ({ id: r.id, legs: legsOf(r.legs), firstKickoffAt: r.firstKickoffAt, legHits: Array.isArray(r.legHits) ? (r.legHits as Array<boolean | null>) : null })),
    loadOutcomes: async (matchIds) => {
      const rows = matchIds.length
        ? await prisma.predictionRecord.findMany({ where: { matchId: { in: matchIds }, actualScore: { not: null } }, select: { matchId: true, actualScore: true } })
        : [];
      return new Map(rows.map((r) => [r.matchId, { score: r.actualScore }]));
    },
    save: async (u, now) => {
      await prisma.comboCouponLog.update({
        where: { id: u.id },
        data: { legHits: u.legHits, updatedAt: now, ...(u.settled ? { settledAt: now, hit: u.hit } : {}) },
      });
    },
  };
}

/** Gece değerlendirme işinden (tahmin skorları yazıldıktan sonra) çağrılır. Tablo yoksa `skipped: 'no-table'`. */
export async function settleComboCoupons(deps?: SettleDeps, now: Date = new Date()): Promise<{ checked: number; settled: number; hits: number; skipped?: 'no-table' }> {
  const d = deps ?? (await prismaDeps());
  let open: OpenCoupon[];
  try {
    open = await d.loadOpen(now);
  } catch (error) {
    if (isMissingTable(error) || (error as { code?: string })?.code === 'P2021') return { checked: 0, settled: 0, hits: 0, skipped: 'no-table' };
    throw error;
  }
  if (!open.length) return { checked: 0, settled: 0, hits: 0 };
  const outcomes = await d.loadOutcomes([...new Set(open.flatMap((c) => c.legs.map((l) => l.matchId)))]);
  const updates = planCouponSettlement(open, outcomes, now.getTime());
  for (const u of updates) await d.save(u, now);
  const settled = updates.filter((u) => u.settled);
  return { checked: open.length, settled: settled.length, hits: settled.filter((u) => u.hit === true).length };
}

// ── Geçmiş kuponlar (kart "Geçmiş" sekmesi) — saf kısım utils/comboHistory.ts ─────────────────────────────────────────
export { buildCouponHistory, couponHistoryStatus } from '@/utils/comboHistory';
export type { CouponHistory, HistoryCoupon, HistoryLeg, HistoryStatus, HistorySummary } from '@/utils/comboHistory';

/** Son `days` günün kuponları (test verisi hariç). Tablo yoksa boş + `tableMissing`. */
export async function loadCouponHistory(days = 120): Promise<CouponHistory> {
  const { prisma } = await import('@/lib/prisma');
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString().slice(0, 10);
  try {
    const rows = await prisma.comboCouponLog.findMany({
      where: { testData: false, day: { gte: since } },
      select: { day: true, kind: true, legs: true, probability: true, odds: true, settledAt: true, hit: true, legHits: true },
      orderBy: [{ day: 'desc' }],
      take: days * 3,
    });
    return buildCouponHistory(rows);
  } catch (error) {
    if (isMissingTable(error) || (error as { code?: string })?.code === 'P2021') return { ...buildCouponHistory([]), tableMissing: true };
    throw error;
  }
}
