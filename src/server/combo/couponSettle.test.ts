import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { COUPON_VOID_AFTER_MS, planCouponSettlement, settleComboCoupons, type OpenCoupon, type SettleDeps } from './couponLog';

const NOW = Date.UTC(2026, 10, 21, 3, 0);
const coupon = (id: string, legs: Array<[string, OpenCoupon['legs'][number]['key']]>, startedHoursAgo = 10, legHits: OpenCoupon['legHits'] = null): OpenCoupon => ({
  id,
  legs: legs.map(([matchId, key]) => ({ matchId, key })),
  firstKickoffAt: new Date(NOW - startedHoursAgo * 3600_000),
  legHits,
});
const outcomes = new Map([
  ['m1', { score: '2-1' }], // 3 gol: over25 ✓, btts ✓
  ['m2', { score: '0-0' }], // under15 ✓, btts ✗
]);

describe('planCouponSettlement', () => {
  it('tüm maçlar tuttu → kapanır, hit; tek ıska → kapanır, miss', () => {
    const u = planCouponSettlement([coupon('a', [['m1', 'over25'], ['m2', 'under15']]), coupon('b', [['m1', 'btts'], ['m2', 'btts']])], outcomes, NOW);
    expect(u).toEqual([
      { id: 'a', legHits: [true, true], settled: true, hit: true },
      { id: 'b', legHits: [true, false], settled: true, hit: false },
    ]);
  });

  it('bilinmeyen maç + ıska yok → açık kalır (yalnız değişen ara sonuç yazılır); ıska varsa bilinmeyene rağmen kapanır', () => {
    expect(planCouponSettlement([coupon('c', [['m1', 'over25'], ['m9', 'over15']])], outcomes, NOW)).toEqual([{ id: 'c', legHits: [true, null], settled: false, hit: null }]);
    expect(planCouponSettlement([coupon('c', [['m1', 'over25'], ['m9', 'over15']], 10, [true, null])], outcomes, NOW)).toEqual([]);
    expect(planCouponSettlement([coupon('d', [['m2', 'btts'], ['m9', 'over15']])], outcomes, NOW)[0]).toMatchObject({ settled: true, hit: false });
  });

  it('ilk maçtan 7 gün sonra hâlâ bilinmeyen varsa "sonuçlanamadı" (hit=null) diye kapanır', () => {
    const old = coupon('e', [['m1', 'over25'], ['m9', 'over15']], COUPON_VOID_AFTER_MS / 3600_000 + 1);
    expect(planCouponSettlement([old], outcomes, NOW)).toEqual([{ id: 'e', legHits: [true, null], settled: true, hit: null }]);
  });
});

describe('settleComboCoupons', () => {
  it('açık kuponların maç skorlarını tek seferde ister, değişenleri yazar, özet döner', async () => {
    const save = vi.fn(async () => {});
    const loadOutcomes = vi.fn(async () => outcomes);
    const deps: SettleDeps = { loadOpen: async () => [coupon('a', [['m1', 'over25'], ['m2', 'under15']]), coupon('b', [['m1', 'btts'], ['m2', 'btts']])], loadOutcomes, save };
    expect(await settleComboCoupons(deps, new Date(NOW))).toEqual({ checked: 2, settled: 2, hits: 1 });
    expect(loadOutcomes).toHaveBeenCalledWith(['m1', 'm2']);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('tablo yoksa atlar', async () => {
    const deps: SettleDeps = {
      loadOpen: async () => {
        throw Object.assign(new Error('relation "ComboCouponLog" does not exist'), { code: '42P01' });
      },
      loadOutcomes: async () => new Map(),
      save: async () => {},
    };
    expect(await settleComboCoupons(deps, new Date(NOW))).toEqual({ checked: 0, settled: 0, hits: 0, skipped: 'no-table' });
  });
});
