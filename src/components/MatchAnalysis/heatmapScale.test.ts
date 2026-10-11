import { describe, expect, it } from 'vitest';
import { FLAT_LEVEL, normalizeHeat, sanitizeGrid } from './heatmapScale';

// Canlı analizlerden (2026-10) birebir grid'ler.
const LUNA_LIV_CITY = {
  home: [8, 10, 8, 7, 8, 12, 16, 14, 11, 13, 14, 18, 16, 13, 15],
  away: [7, 9, 10, 11, 13, 10, 14, 17, 16, 18, 12, 16, 19, 18, 17],
};
const GPT41_GS_KASIMPASA = {
  home: [35, 45, 60, 70, 80, 30, 40, 65, 60, 75, 20, 30, 50, 55, 65],
  away: [65, 60, 55, 45, 35, 70, 65, 50, 40, 30, 55, 50, 40, 35, 25],
};

const valid = (g: (number | null)[]) => g.filter((v): v is number => v !== null);

describe('normalizeHeat — iki takım ortak min–max', () => {
  it('Luna (7–19): en yoğun hücre 1, en zayıf 0; mutlak skalada soluk kalan grid tam aralığa yayılır', () => {
    const { home, away } = normalizeHeat(LUNA_LIV_CITY.home, LUNA_LIV_CITY.away);
    expect(away[12]).toBe(1); // 19 — City rakip kale önü merkez
    expect(home[3]).toBe(0); // 7
    expect(away[0]).toBe(0); // 7
    expect(home[11]).toBeCloseTo((18 - 7) / 12); // Liverpool'un en yoğunu
    expect(Math.max(...valid([...home, ...away]))).toBe(1);
  });

  it('gpt-4.1 (20–80): aynı sıralama, tam aralık', () => {
    const { home, away } = normalizeHeat(GPT41_GS_KASIMPASA.home, GPT41_GS_KASIMPASA.away);
    expect(home[4]).toBe(1); // 80
    expect(home[10]).toBe(0); // 20
    expect(away[5]).toBeCloseTo(50 / 60); // 70
    expect(away[14]).toBeCloseTo(5 / 60); // 25
  });

  it('ortak ölçek: zayıf takımın grid\'i baskın takımınkine göre düşük kalır (takım başına ayrı yayılmaz)', () => {
    const { home, away } = normalizeHeat(Array(15).fill(80), Array(15).fill(20));
    expect(new Set(home)).toEqual(new Set([1]));
    expect(new Set(away)).toEqual(new Set([0]));
  });

  it('düz grid (fark < 5): yapay kırmızı yok, her geçerli hücre orta ton', () => {
    const { home, away } = normalizeHeat(Array(15).fill(12), [10, 11, 12, 13, 14, 10, 11, 12, 13, 14, 10, 11, 12, 13, 14]);
    expect(new Set([...home, ...away])).toEqual(new Set([FLAT_LEVEL]));
  });

  it('fark tam 5 → artık düz sayılmaz', () => {
    const { home } = normalizeHeat([10, 15], []);
    expect(home[0]).toBe(0);
    expect(home[1]).toBe(1);
  });

  it('hepsi 0 → hiçbir hücre yoğun değil', () => {
    const { home, away } = normalizeHeat(Array(15).fill(0), Array(15).fill(0));
    expect(new Set([...home, ...away])).toEqual(new Set([0]));
  });
});

describe('eksik / bozuk grid', () => {
  it('grid yok ya da dizi değil → hücreler null (çizilmez), diğer takım kendi değerleriyle yayılır', () => {
    for (const bad of [undefined, null, 'abc', { 0: 50 }, 42]) {
      const { home, away } = normalizeHeat(bad, GPT41_GS_KASIMPASA.away);
      expect(home.every((v) => v === null)).toBe(true);
      expect(Math.max(...valid(away))).toBe(1); // 70
      expect(Math.min(...valid(away))).toBe(0); // 25
    }
  });

  it('ikisi de yoksa her şey null', () => {
    const { home, away } = normalizeHeat(undefined, []);
    expect([...home, ...away].every((v) => v === null)).toBe(true);
  });

  it('kısa dizi eksik hücreleri null; uzun dizinin 15 sonrası yok sayılır', () => {
    expect(sanitizeGrid([10, 20])).toEqual([10, 20, ...Array(13).fill(null)]);
    expect(sanitizeGrid([...Array(15).fill(5), 99])).toEqual(Array(15).fill(5));
  });

  it('sayı olmayan hücre null; sayısal metin okunur; aralık dışı 0–100\'e kırpılır', () => {
    const g = sanitizeGrid(['40', 'x', null, true, NaN, Infinity, -10, 250, '', 7.5]);
    expect(g.slice(0, 10)).toEqual([40, null, null, null, null, null, 0, 100, null, 7.5]);
  });

  it('bozuk hücreler min–max hesabına girmez', () => {
    const { home } = normalizeHeat([10, 'x', 30, null, 20], []);
    expect(home.slice(0, 5)).toEqual([0, null, 1, null, 0.5]);
  });
});
