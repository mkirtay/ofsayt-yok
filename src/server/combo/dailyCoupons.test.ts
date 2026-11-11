import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({ withRedis: async (_f: unknown, fb: unknown) => fb, getRedisClient: () => null, fitsInRedis: () => true }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/server/homeDay', () => ({ loadHomeDay: vi.fn() }));

import { buildDailyCoupons, istanbulMinutes, parseDailyTime, COUPON_KINDS, MIN_ANALYSED_MATCHES } from './dailyCoupons';
import type { ComboCandidateRow } from './candidates';
import type { OddsResult } from './afOdds';

const row = (id: string, pct: number, source: 'db' | 'test' = 'db', national = false): ComboCandidateRow => ({
  matchId: id, label: id, homeName: `H${id}`, awayName: `A${id}`, competition: 'L', kickoffIso: '2026-11-12T17:00:00.000Z', key: 'over15', pct, source, national, poolScore: 40,
});
const okOdds = (m: Record<string, number>) => async (reqs: readonly { matchId: string }[]): Promise<OddsResult[]> =>
  reqs.map((r) => (m[r.matchId] ? ({ matchId: r.matchId, status: 'ok', afFixtureId: 1, market: { odd: m[r.matchId], bookmaker: 'Bet365', median: m[r.matchId], bookmakers: 3 }, updatedAt: null } as OddsResult) : { matchId: r.matchId, status: 'no-odds' } as OddsResult));

describe('buildDailyCoupons', () => {
  it('yeterli analiz yok → insufficient, kupon ZORLANMAZ ve oran çekilmez', async () => {
    const odds = vi.fn();
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => [row('1', 90), row('2', 88)], odds: odds as never });
    expect(MIN_ANALYSED_MATCHES).toBe(3);
    expect(p).toMatchObject({ status: 'insufficient', reason: 'few-analyses', analysed: 2, coupons: [] });
    expect(odds).not.toHaveBeenCalled();
  });

  it('üç kupon: Garantici ~1,7 / Dengeli / Riskli; risk arttıkça olasılık düşer, oran artar', async () => {
    const cands = [row('1', 90), row('2', 86), row('3', 82), row('4', 78), row('5', 72), row('6', 66), row('7', 62), row('8', 58)];
    const odds = okOdds({ '1': 1.12, '2': 1.2, '3': 1.3, '4': 1.45, '5': 1.7, '6': 2, '7': 2.3, '8': 2.6 });
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => cands, odds: odds as never });
    expect(p.status).toBe('ok');
    expect(p.coupons.map((c) => c.kind)).toEqual(['safe', 'balanced', 'bold']);
    const [safe, bal, bold] = p.coupons;
    expect(safe.odds).toBeGreaterThanOrEqual(1.7);
    expect(safe.odds!).toBeLessThan(2.5);
    expect(bal.odds!).toBeGreaterThanOrEqual(4);
    expect(bold.odds!).toBeGreaterThanOrEqual(10);
    expect(safe.probability).toBeGreaterThan(bal.probability);
    expect(bal.probability).toBeGreaterThan(bold.probability);
    for (const k of COUPON_KINDS) {
      const c = p.coupons.find((x) => x.kind === k.kind)!;
      expect(c.legs.length).toBeLessThanOrEqual(k.maxMatches);
      expect(c.legs.every((l) => l.pct >= k.floor)).toBe(true); // üretim tabanı
    }
    expect(p.testData).toBe(false);
    expect(p.thresholdRelaxed).toBe(false);
  });

  it('zayıf pick\'ler: üretimde taban altına inilmez → kupon yok / insufficient', async () => {
    const weak = [row('1', 52), row('2', 50), row('3', 51)];
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => weak, odds: okOdds({}) as never });
    expect(p).toMatchObject({ status: 'insufficient', reason: 'no-strong-picks', coupons: [] });
  });

  it('oran gelmeyen maçlarda oransız (yalnız olasılık) öneri; oran alanı null', async () => {
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => [row('1', 90), row('2', 85), row('3', 80), row('4', 75)], odds: okOdds({}) as never });
    expect(p.status).toBe('ok');
    expect(p.coupons[0].odds).toBeNull();
    expect(p.coupons[0].legs.every((l) => l.odd === null)).toBe(true);
  });

  it('test verisi: taban gevşer ve açıkça işaretlenir (thresholdRelaxed, testData)', async () => {
    const weak = [row('1', 52, 'test', true), row('2', 50, 'test', true), row('3', 51, 'test', true), row('4', 48, 'test', true)];
    const p = await buildDailyCoupons('2026-11-12', { candidates: async () => weak, odds: okOdds({}) as never });
    expect(p.status).toBe('ok');
    expect(p.testData).toBe(true);
    expect(p.thresholdRelaxed).toBe(true);
    expect(p.coupons.length).toBeGreaterThan(0);
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
