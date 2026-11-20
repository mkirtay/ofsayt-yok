/**
 * Günün Kombinesi geçmişi — saf yardımcılar (sunucu + istemci). Kayıt satırı → kart "Geçmiş" sekmesi verisi.
 * Kaynak satırlar: ComboCouponLog (server/combo/couponLog.ts).
 */
import type { ComboMarketKey } from '@/utils/comboMarkets';

export type HistoryStatus = 'hit' | 'miss' | 'void' | 'pending';
export type HistoryLeg = { matchId: string; homeName: string; awayName: string; homeLogo?: string | null; awayLogo?: string | null; key: ComboMarketKey; pct: number; fairOdd: number; hit: boolean | null };
export type HistoryCoupon = { day: string; kind: string; probability: number; fairOdds: number; refOdds: number | null; status: HistoryStatus; legs: HistoryLeg[] };
export type HistorySummary = { total: number; settled: number; hits: number; hitRate: number | null; pending: number; avgProbability: number | null };
export type CouponHistory = { coupons: HistoryCoupon[]; summary: HistorySummary; byKind: Record<string, HistorySummary>; tableMissing?: boolean };

export type LogRow = { day: string; kind: string; legs: unknown; probability: number; odds: number | null; settledAt: Date | null; hit: boolean | null; legHits: unknown };

export function couponHistoryStatus(r: Pick<LogRow, 'settledAt' | 'hit'>): HistoryStatus {
  if (!r.settledAt) return 'pending';
  return r.hit === true ? 'hit' : r.hit === false ? 'miss' : 'void';
}

function summarize(items: ReadonlyArray<HistoryCoupon>): HistorySummary {
  const settled = items.filter((c) => c.status === 'hit' || c.status === 'miss');
  const hits = settled.filter((c) => c.status === 'hit').length;
  return {
    total: items.length,
    settled: settled.length,
    hits,
    hitRate: settled.length ? Math.round((hits / settled.length) * 1000) / 1000 : null,
    pending: items.filter((c) => c.status === 'pending').length,
    // Beklenen isabet (model): sonuçlanan kuponların olasılık ortalaması — gerçekleşenle karşılaştırma için.
    avgProbability: settled.length ? Math.round((settled.reduce((s, c) => s + c.probability, 0) / settled.length) * 1000) / 1000 : null,
  };
}

/** Kayıt satırlarından geçmiş (saf): yeni gün önce, gün içinde Temkinli → Dengeli → Riskli. */
export function buildCouponHistory(rows: ReadonlyArray<LogRow>): CouponHistory {
  const order: Record<string, number> = { safe: 0, balanced: 1, bold: 2 };
  const coupons: HistoryCoupon[] = [...rows]
    .sort((a, b) => b.day.localeCompare(a.day) || (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
    .map((r) => {
      const legHits = Array.isArray(r.legHits) ? (r.legHits as Array<boolean | null>) : [];
      const legs = (Array.isArray(r.legs) ? (r.legs as Array<Partial<HistoryLeg>>) : []).map((l, i) => ({
        matchId: String(l.matchId ?? ''),
        homeName: String(l.homeName ?? ''),
        awayName: String(l.awayName ?? ''),
        homeLogo: l.homeLogo ?? null,
        awayLogo: l.awayLogo ?? null,
        key: l.key as ComboMarketKey,
        pct: Number(l.pct ?? 0),
        fairOdd: Number(l.fairOdd ?? 0),
        hit: legHits[i] ?? null,
      }));
      return {
        day: r.day,
        kind: r.kind,
        probability: r.probability,
        fairOdds: r.probability > 0 ? Math.round((1 / r.probability) * 100) / 100 : 0,
        refOdds: r.odds,
        status: couponHistoryStatus(r),
        legs,
      };
    });
  const byKind: Record<string, HistorySummary> = {};
  for (const k of ['safe', 'balanced', 'bold']) byKind[k] = summarize(coupons.filter((c) => c.kind === k));
  return { coupons, summary: summarize(coupons), byKind };
}

