import { describe, expect, it } from 'vitest';
import { summarize } from './summary';

const p = (pct: number, odd?: number | null) => ({ matchId: String(pct), label: 'x', key: 'over15' as const, pct, odd });

describe('summarize', () => {
  it('oranlı: olasılık, oran, başabaş, değer farkı', () => {
    const s = summarize([p(80, 1.5), p(70, 1.6)]);
    expect(s.probability).toBeCloseTo(0.56, 10);
    expect(s.odds).toBeCloseTo(2.4, 10);
    expect(s.breakEven).toBeCloseTo(1 / 2.4, 10);
    expect(s.edge).toBeCloseTo(0.56 * 2.4 - 1, 10);
    expect(s.missingOdds).toBe(0);
  });
  it('bir maçın oranı yoksa kombine oran / değer yok, eksik sayısı görünür', () => {
    const s = summarize([p(80, 1.5), p(70, null)]);
    expect(s).toMatchObject({ odds: null, breakEven: null, edge: null, missingOdds: 1 });
    expect(s.probability).toBeCloseTo(0.56, 10);
  });
  it('boş seçim', () => {
    expect(summarize([])).toMatchObject({ count: 0, probability: 0, odds: null });
  });
});
