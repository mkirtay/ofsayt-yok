import { describe, expect, it, vi } from 'vitest';
import { loadBacktestPicks, summarizeBacktest, type BacktestPick } from './backtest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

const p = (matchId: string, day: string, pct: number | null, odd: number, hit: boolean | null, pickKey: BacktestPick['pickKey'] = 'over15'): BacktestPick => ({ matchId, day, pickKey, pct, odd, hit });

describe('summarizeBacktest', () => {
  it('tekli: isabet +(oran−1), ıska −1; ROI, isabet oranı, modelin beklediği ROI', () => {
    const s = summarizeBacktest([p('a', 'd1', 80, 1.5, true), p('b', 'd1', 80, 1.5, false), p('c', 'd1', 80, 2, true), p('x', 'd1', 80, 3, null)]);
    expect(s.singles).toMatchObject({ picks: 4, settled: 3, hits: 2, hitRate: 0.667, avgOdd: 1.667, profit: 0.5, roi: 0.167 });
    // model: (0.8·1.5−1 + 0.8·1.5−1 + 0.8·2−1)/3
    expect(s.singles.modelExpectedRoi).toBeCloseTo((0.2 + 0.2 + 0.6) / 3, 3);
  });

  it('günlük kombine: günün en yüksek olasılıklı N pazarı; hepsi tutarsa oran çarpımı, aksi −1; eksik gün sayılmaz', () => {
    const picks = [
      // gün 1: 90/1.2 ✓, 85/1.3 ✓, 80/1.5 ✓ (60 elenir) → kazanç 1.2·1.3·1.5 − 1 = 1.34
      p('a', 'd1', 90, 1.2, true), p('b', 'd1', 85, 1.3, true), p('c', 'd1', 80, 1.5, true), p('z', 'd1', 60, 9, false),
      // gün 2: üçlünün biri ıska → −1
      p('d', 'd2', 90, 1.2, true), p('e', 'd2', 85, 1.3, false), p('f', 'd2', 80, 1.5, true),
      // gün 3: yalnız 2 pazar → kombine kurulamaz
      p('g', 'd3', 90, 1.2, true), p('h', 'd3', 85, 1.3, true),
    ];
    const s = summarizeBacktest(picks, { comboSize: 3 });
    expect(s.combos).toMatchObject({ days: 2, hits: 1, hitRate: 0.5 });
    expect(s.combos.profit).toBeCloseTo(1.34 - 1, 3);
    expect(s.combos.roi).toBeCloseTo((1.34 - 1) / 2, 3);
  });

  it('boş girdi güvenli', () => {
    const s = summarizeBacktest([]);
    expect(s.singles).toMatchObject({ picks: 0, hitRate: null, roi: null });
    expect(s.combos).toMatchObject({ days: 0, roi: null });
  });
});

describe('loadBacktestPicks', () => {
  const row = { matchId: '1', day: '2026-11-12', pickKey: 'over15', pct: 84, firstOdd: 1.1, lastOdd: 1.08 };
  it('sonucu skordan çıkarır; first/last oran seçimi', async () => {
    const deps = { query: async () => [row] as never, records: async () => [{ matchId: '1', actualScore: '2-1', extendedHits: null, evaluatedAt: new Date() }] };
    expect((await loadBacktestPicks('last', deps as never))![0]).toMatchObject({ odd: 1.08, hit: true });
    expect((await loadBacktestPicks('first', deps as never))![0].odd).toBe(1.1);
  });
  it('değerlendirilmemiş maç → hit null; tablo yok → null; boş tablo → []', async () => {
    expect((await loadBacktestPicks('last', { query: async () => [row] as never, records: async () => [] }))![0].hit).toBeNull();
    const missing = Object.assign(new Error('relation "ComboOddsSnapshot" does not exist'), { code: '42P01' });
    expect(await loadBacktestPicks('last', { query: async () => { throw missing; } })).toBeNull();
    expect(await loadBacktestPicks('last', { query: async () => [] })).toEqual([]);
  });
  it('tablo dışı hata fırlatılır', async () => {
    await expect(loadBacktestPicks('last', { query: async () => { throw new Error('boom'); } })).rejects.toThrow('boom');
  });
});
