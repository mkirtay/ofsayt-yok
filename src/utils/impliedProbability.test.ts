import { describe, expect, it } from 'vitest';
import { impliedProbabilities } from './impliedProbability';

describe('impliedProbabilities', () => {
  it('oranlardan marjı düşülmüş yüzde, toplam 100', () => {
    // 1/1.95 + 1/3.40 + 1/3.80 = 1,0700 → 47,9 / 27,5 / 24,6
    expect(impliedProbabilities({ '1': 1.95, X: 3.4, '2': 3.8 })).toEqual({ home: 48, draw: 27, away: 25 });
    for (const odds of [{ '1': 2.5, X: 3.1, '2': 2.9 }, { '1': 1.2, X: 6.5, '2': 13 }, { '1': 3, X: 3, '2': 3 }]) {
      const p = impliedProbabilities(odds)!;
      expect(p.home + p.draw + p.away).toBe(100);
    }
    expect(impliedProbabilities({ '1': 3, X: 3, '2': 3 })).toEqual({ home: 34, draw: 33, away: 33 });
  });

  it('eksik ya da geçersiz oran → null (şerit çizilmez)', () => {
    expect(impliedProbabilities(undefined)).toBeNull();
    expect(impliedProbabilities({ '1': 1.9, X: 3.4 })).toBeNull();
    expect(impliedProbabilities({ '1': 1, X: 3.4, '2': 4 })).toBeNull();
    expect(impliedProbabilities({ '1': Number.NaN, X: 3.4, '2': 4 })).toBeNull();
  });
});
