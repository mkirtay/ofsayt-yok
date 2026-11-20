import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { buildCouponHistory, couponHistoryStatus } from './couponLog';

const leg = (matchId: string, key = 'over25') => ({ matchId, homeName: `E${matchId}`, awayName: `D${matchId}`, key, pct: 72, fairOdd: 1.39, homeLogo: null, awayLogo: null });
const row = (day: string, kind: string, over: Partial<Parameters<typeof buildCouponHistory>[0][number]> = {}) => ({
  day, kind, legs: [leg(`${day}-${kind}-1`), leg(`${day}-${kind}-2`)], probability: 0.5, odds: 2.1, settledAt: null, hit: null, legHits: null, ...over,
});
const S = new Date('2026-11-21T03:00:00Z');

describe('kupon geçmişi', () => {
  it('durum: sonuçlanmamış bekliyor; hit true/false/null → tuttu/tutmadı/sonuçlanamadı', () => {
    expect(couponHistoryStatus({ settledAt: null, hit: null })).toBe('pending');
    expect(couponHistoryStatus({ settledAt: S, hit: true })).toBe('hit');
    expect(couponHistoryStatus({ settledAt: S, hit: false })).toBe('miss');
    expect(couponHistoryStatus({ settledAt: S, hit: null })).toBe('void');
  });

  it('sıra: yeni gün önce, gün içinde Temkinli → Dengeli → Riskli; maç sonuçları sırayla; adil oran 1/olasılık', () => {
    const h = buildCouponHistory([
      row('2026-11-19', 'bold', { settledAt: S, hit: false, legHits: [true, false], probability: 0.25 }),
      row('2026-11-20', 'safe'),
      row('2026-11-19', 'safe', { settledAt: S, hit: true, legHits: [true, true], probability: 0.6 }),
    ]);
    expect(h.coupons.map((c) => `${c.day}/${c.kind}/${c.status}`)).toEqual(['2026-11-20/safe/pending', '2026-11-19/safe/hit', '2026-11-19/bold/miss']);
    expect(h.coupons[2]!.legs.map((l) => l.hit)).toEqual([true, false]);
    expect(h.coupons[1]!.fairOdds).toBe(1.67);
  });

  it('özet: sonuçlananlar üzerinden isabet; bekleyen ayrı; tür başına; model beklentisi ortalama olasılık', () => {
    const h = buildCouponHistory([
      row('2026-11-19', 'safe', { settledAt: S, hit: true, probability: 0.6 }),
      row('2026-11-18', 'safe', { settledAt: S, hit: false, probability: 0.6 }),
      row('2026-11-18', 'bold', { settledAt: S, hit: null }),
      row('2026-11-20', 'balanced'),
    ]);
    expect(h.summary).toEqual({ total: 4, settled: 2, hits: 1, hitRate: 0.5, pending: 1, avgProbability: 0.6 });
    expect(h.byKind.safe).toMatchObject({ settled: 2, hits: 1 });
    expect(h.byKind.bold).toMatchObject({ settled: 0, hitRate: null });
    expect(buildCouponHistory([]).summary).toMatchObject({ total: 0, hitRate: null });
  });
});
