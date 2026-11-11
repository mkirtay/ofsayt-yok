import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({ withRedis: async (_f: unknown, fb: unknown) => fb, getRedisClient: () => null, fitsInRedis: () => true }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/server/homeDay', () => ({ loadHomeDay: vi.fn() }));

import { buildDailyCoupons, istanbulMinutes, parseDailyTime, COUPON_KINDS, MIN_ANALYSED_MATCHES } from './dailyCoupons';
import type { ComboCandidateRow } from './candidates';
import type { OddsResult } from './afOdds';
import { comboMarketPcts, devigPair, fairOdds, type ComboMarketKey } from '@/utils/comboMarkets';

/** Aday: model gol olasılıkları (2+/3+/4+ gol, iki takım da gol bulur). */
const row = (id: string, ge: { over15: number; over25: number; over35: number; btts: number }, source: 'db' | 'test' = 'db'): ComboCandidateRow => ({
  matchId: id, label: id, homeName: `H${id}`, awayName: `A${id}`, competition: 'L', kickoffIso: '2026-11-12T17:00:00.000Z', key: 'over25', pct: ge.over25, source, national: false, poolScore: 40,
  markets: comboMarketPcts({ goalExpectation: ge }),
});
/** Piyasa: maç başına (üst 2,5 oranı, alt 2,5 oranı) gibi iki yönlü oranlar → marjı temizlenmiş olasılık. */
type Prices = Partial<Record<'15' | '25' | '35' | 'btts', [number, number]>>;
const marketsFrom = (p: Prices) => {
  const out: Record<string, { marketPct: number; odd: number; bookmakers: number }> = {};
  const add = (yes: ComboMarketKey, no: ComboMarketKey, pair?: [number, number]) => {
    if (!pair) return;
    out[yes] = { marketPct: Math.round(devigPair(pair[0], pair[1])! * 10) / 10, odd: pair[0], bookmakers: 3 };
    out[no] = { marketPct: Math.round(devigPair(pair[1], pair[0])! * 10) / 10, odd: pair[1], bookmakers: 3 };
  };
  add('over15', 'under15', p['15']);
  add('over25', 'under25', p['25']);
  add('over35', 'under35', p['35']);
  add('btts', 'bttsNo', p.btts);
  return out;
};
const odds = (m: Record<string, Prices>) => async (reqs: readonly { matchId: string }[]): Promise<OddsResult[]> =>
  reqs.map((r) =>
    m[r.matchId]
      ? ({ matchId: r.matchId, status: 'ok', afFixtureId: 1, market: { odd: 2, bookmaker: 'Bet365', median: 2, bookmakers: 3 }, markets: marketsFrom(m[r.matchId]), updatedAt: null } as OddsResult)
      : ({ matchId: r.matchId, status: 'no-odds' } as OddsResult),
  );

// Tipik maç: 2+ gol çok olası (1,5 üst ~1,20 → aralık dışı), 2,5 üst ~1,65, 3,5 alt ~1,40, iki takım da gol ~1,80.
const typical: Prices = { '15': [1.2, 4.5], '25': [1.65, 2.25], '35': [2.6, 1.45], btts: [1.8, 1.95] };
const ge = { over15: 82, over25: 60, over35: 35, btts: 52 };

describe('buildDailyCoupons', () => {
  it('yeterli analiz yok → insufficient, kupon ZORLANMAZ ve oran çekilmez', async () => {
    const o = vi.fn();
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => [row('1', ge), row('2', ge)], odds: o as never });
    expect(MIN_ANALYSED_MATCHES).toBe(3);
    expect(p).toMatchObject({ status: 'insufficient', reason: 'few-analyses', analysed: 2, coupons: [] });
    expect(o).not.toHaveBeenCalled();
  });

  it('tür tanımı: 2 / 3 / 4 bacak, olasılık aralıkları azalan; üst sınır adil oranı 1,25 altına düşürmez', () => {
    expect(COUPON_KINDS.map((k) => k.legs)).toEqual([2, 3, 4]);
    for (const k of COUPON_KINDS) expect(fairOdds(k.maxPct)).toBeGreaterThanOrEqual(1.25);
  });

  it('yalnız toplam gol / iki takım da gol pazarları; her bacak türün aralığında; maç başına tek bacak; adil oran = 1 / olasılık', async () => {
    const cands = Array.from({ length: 8 }, (_, i) => row(String(i + 1), ge));
    const m: Record<string, Prices> = {};
    cands.forEach((c, i) => (m[c.matchId] = { ...typical, '25': [1.5 + i * 0.08, 2.6 - i * 0.08] }));
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => cands, odds: odds(m) as never });
    expect(p.status).toBe('ok');
    expect(p.coupons.map((c) => c.kind)).toEqual(['safe', 'balanced', 'bold']);
    const allowed = ['over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'btts', 'bttsNo'];
    for (const c of p.coupons) {
      const spec = COUPON_KINDS.find((k) => k.kind === c.kind)!;
      expect(c.legs).toHaveLength(spec.legs);
      expect(new Set(c.legs.map((l) => l.matchId)).size).toBe(c.legs.length);
      for (const l of c.legs) {
        expect(allowed).toContain(l.key);
        expect(l.pct).toBeGreaterThanOrEqual(spec.minPct);
        expect(l.pct).toBeLessThanOrEqual(spec.maxPct);
        expect(l.fairOdd).toBe(fairOdds(l.pct));
        expect(l.fairOdd).toBeGreaterThanOrEqual(1.25); // 1,05'lik bacak yok
        expect(l.marketPct).not.toBeNull();
      }
      expect(c.fairOdds).toBeCloseTo(1 / c.probability, 2);
      expect(c.refOdds).not.toBeNull();
    }
    const [safe, bal, bold] = p.coupons;
    expect(safe.probability).toBeGreaterThan(bal.probability);
    expect(bal.probability).toBeGreaterThan(bold.probability);
    expect(bold.fairOdds).toBeGreaterThan(5);
  });

  it('harman: piyasa ağır basar (model %90 dese de piyasa %55 ise bacak ~%64)', async () => {
    const strongModel = { over15: 95, over25: 90, over35: 70, btts: 80 };
    const cands = [row('1', strongModel), row('2', strongModel), row('3', strongModel)];
    const m = Object.fromEntries(cands.map((c) => [c.matchId, { '25': [1.75, 2.1] as [number, number] }]));
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => cands, odds: odds(m) as never });
    const leg = p.coupons.flatMap((c) => c.legs).find((l) => l.key === 'over25')!;
    expect(leg.modelPct).toBe(90);
    expect(leg.pct).toBeGreaterThan(leg.marketPct!);
    expect(leg.pct).toBeLessThan(70);
  });

  it('piyasa verisi olmayan maç kupona girmez (kayıtlı analizde) → yeterli maç yoksa kupon yok', async () => {
    const cands = [row('1', ge), row('2', ge), row('3', ge), row('4', ge)];
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => cands, odds: odds({}) as never });
    expect(p).toMatchObject({ status: 'insufficient', reason: 'no-strong-picks', coupons: [] });
  });

  it('aralığa uyan maç yetmezse o tür üretilmez (zorlanmaz); diğerleri durur', async () => {
    // Yalnız 2 maç Temkinli aralığına (%70–80) düşer; Riskli için 4 maç yok.
    const cands = [row('1', ge), row('2', ge), row('3', ge)];
    const m = { '1': typical, '2': typical, '3': typical };
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => cands, odds: odds(m) as never });
    expect(p.coupons.find((c) => c.kind === 'bold')).toBeUndefined();
  });

  it('test verisi (geliştirme): piyasa olmadan model tek başına; testData işaretli', async () => {
    const cands = [row('1', ge, 'test'), row('2', ge, 'test'), row('3', ge, 'test'), row('4', ge, 'test')];
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => cands, odds: odds({}) as never });
    expect(p.status).toBe('ok');
    expect(p.testData).toBe(true);
    for (const c of p.coupons) for (const l of c.legs) {
      expect(l.marketPct).toBeNull();
      expect(l.pct).toBe(l.modelPct);
    }
  });
});

describe('zaman yardımcıları', () => {
  it('parseDailyTime: geçerli / geçersiz', () => {
    expect(parseDailyTime('17:30')).toBe(1050);
    expect(parseDailyTime('9:05')).toBe(545);
    expect(parseDailyTime('25:00')).toBe(1050);
    expect(parseDailyTime('abc')).toBe(1050);
    expect(parseDailyTime(undefined)).toBe(1050);
  });
  it('istanbulMinutes: UTC 14:30 → 17:30 (UTC+3)', () => {
    expect(istanbulMinutes(Date.parse('2026-11-12T14:30:00Z'))).toBe(1050);
  });
});
