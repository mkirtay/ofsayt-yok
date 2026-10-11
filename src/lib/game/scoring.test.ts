import { describe, expect, it } from 'vitest';
import { buildDistribution, isRareScore, isValidGoals, outcomeShares, scorePrediction } from './scoring';

const s = (home: number, away: number) => ({ home, away });
const pts = (p: [number, number], a: [number, number], o: { rare?: boolean; joker?: boolean } = {}) =>
  scorePrediction(s(...p), s(...a), { rare: o.rare ?? false, joker: o.joker ?? false });

describe('tahmin oyunu puanlaması v1', () => {
  it.each([
    // [tahmin, sonuç, puan, açıklama]
    [[2, 1], [2, 1], 8, 'tam skor: yön 3 + fark 1 + toplam 1 + tam 3'],
    [[2, 1], [3, 2], 4, 'yön + fark'],
    [[2, 1], [1, 0], 4, 'yön + fark (1 fark)'],
    [[2, 1], [3, 0], 4, 'yön + toplam (3 gol)'],
    [[2, 1], [4, 0], 3, 'yalnız yön'],
    [[1, 1], [2, 2], 4, 'beraberlik: yön + fark (0)'],
    [[1, 1], [0, 0], 4, 'beraberlik: yön + fark'],
    [[0, 0], [0, 0], 8, '0-0 tam skor'],
    [[2, 1], [1, 2], 1, 'ters yön, toplam doğru'],
    [[2, 0], [0, 1], 0, 'hiçbiri'],
    [[1, 1], [2, 0], 1, 'beraberlik tahmini, toplam doğru'],
  ] as [[number, number], [number, number], number, string][])('%j → %j = %i (%s)', (p, a, expected) => {
    expect(pts(p, a).points).toBe(expected);
  });

  it('nadir skor yalnız tam skorda +2; joker ×2', () => {
    expect(pts([4, 3], [4, 3], { rare: true }).points).toBe(10);
    expect(pts([4, 2], [4, 3], { rare: true }).points).toBe(3); // tam skor değil → nadir bonusu yok, yalnız yön
    expect(pts([4, 3], [4, 3], { rare: true, joker: true }).points).toBe(20);
    expect(pts([2, 1], [3, 2], { joker: true })).toEqual({ points: 8, breakdown: { dir: 3, diff: 1, total: 0, exact: 0, rare: 0, joker: true } });
    expect(pts([2, 0], [0, 1], { joker: true }).points).toBe(0);
  });

  it('nadir: pay ≤ %5 ve en az 30 tahmin', () => {
    const many = [...Array(95)].map(() => s(1, 0)).concat([...Array(5)].map(() => s(4, 3)));
    const d = buildDistribution(many);
    expect(d._total).toBe(100);
    expect(isRareScore(s(4, 3), d)).toBe(true); // 5/100
    expect(isRareScore(s(5, 5), d)).toBe(true); // 0/100
    expect(isRareScore(s(1, 0), d)).toBe(false);
    const few = buildDistribution([...Array(29)].map(() => s(1, 0)));
    expect(isRareScore(s(4, 3), few)).toBe(false);
    expect(isRareScore(s(4, 3), null)).toBe(false);
  });

  it('1/X/2 payları', () => {
    expect(outcomeShares(buildDistribution([s(1, 0), s(2, 1), s(1, 1), s(0, 2)]))).toEqual({ home: 50, draw: 25, away: 25 });
  });

  it('gol sınırı 0–15 tam sayı', () => {
    for (const ok of [0, 3, 15]) expect(isValidGoals(ok)).toBe(true);
    for (const bad of [-1, 16, 1.5, '2', null, NaN]) expect(isValidGoals(bad)).toBe(false);
  });
});
