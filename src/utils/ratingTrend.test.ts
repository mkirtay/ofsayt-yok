import { describe, expect, it } from 'vitest';
import {
  buildRatingSeries,
  consistencyOf,
  ratingChartLayout,
  ratingYDomain,
  standardDeviation,
  summarizeRatings,
  type RatingMatchInput,
} from './ratingTrend';

const m = (matchId: number, date: string, rating?: number): RatingMatchInput => ({
  matchId,
  date,
  isHome: matchId % 2 === 0,
  opponent: `Rakip ${matchId}`,
  ...(rating !== undefined ? { rating } : {}),
});

describe('buildRatingSeries', () => {
  it('son 20 maçı alır, reytingsizleri sayıp atar, eski → yeni sıralar', () => {
    // 25 maç, en yeni en başta DEĞİL (karışık sıra), 3'ü reytingsiz
    const rows = Array.from({ length: 25 }, (_, i) => m(i + 1, `2026-01-${String(i + 1).padStart(2, '0')}`, [5, 9, 13].includes(i + 1) ? undefined : 6 + (i % 5) * 0.3)).reverse();
    rows.push(rows.shift()!);
    const s = buildRatingSeries(rows);
    expect(s.considered).toBe(20);
    // son 20 maç = 6..25; reytingsiz olanlardan 9 ve 13 içeride
    expect(s.missing).toBe(2);
    expect(s.points).toHaveLength(18);
    expect(s.points[0].matchId).toBe(6);
    expect(s.points.at(-1)!.matchId).toBe(25);
  });

  it('0 / NaN reyting = reytingsiz', () => {
    const s = buildRatingSeries([m(1, '2026-01-01', 0), m(2, '2026-01-02', Number.NaN), m(3, '2026-01-03', 7)]);
    expect(s).toMatchObject({ missing: 2, considered: 3 });
    expect(s.points.map((p) => p.matchId)).toEqual([3]);
  });

  it('az maçlı oyuncu: limit altında hepsi', () => {
    const s = buildRatingSeries([m(1, '2026-01-01', 7.1), m(2, '2026-01-02', 6.2)]);
    expect(s).toMatchObject({ missing: 0, considered: 2 });
  });
});

describe('istikrar (σ) eşikleri', () => {
  it('standardDeviation popülasyon σ', () => {
    expect(standardDeviation([7, 7, 7])).toBe(0);
    expect(standardDeviation([6, 8])).toBe(1);
  });

  it.each([
    [0, 'stable'],
    [0.349, 'stable'],
    [0.35, 'balanced'],
    [0.649, 'balanced'],
    [0.65, 'volatile'],
    [1.2, 'volatile'],
  ] as const)('σ=%s → %s', (sd, label) => {
    expect(consistencyOf(sd, 5)).toBe(label);
  });

  it('5 maçtan az → etiket yok', () => {
    expect(consistencyOf(0.1, 4)).toBeNull();
    expect(consistencyOf(0.1, 0)).toBeNull();
  });
});

describe('summarizeRatings', () => {
  it('ortalama, en iyi/en kötü (eşitlikte en yeni), σ ve etiket', () => {
    const { points } = buildRatingSeries([
      m(1, '2026-01-01', 7.0),
      m(2, '2026-01-02', 8.2),
      m(3, '2026-01-03', 6.1),
      m(4, '2026-01-04', 8.2),
      m(5, '2026-01-05', 6.1),
    ]);
    const s = summarizeRatings(points)!;
    expect(s.average).toBeCloseTo(7.12, 5);
    expect(s.best.matchId).toBe(4);
    expect(s.worst.matchId).toBe(5);
    expect(s.consistency).toBe('volatile'); // σ ≈ 0.93
  });

  it('boş seri → null; 4 maç → istikrar null', () => {
    expect(summarizeRatings([])).toBeNull();
    const { points } = buildRatingSeries([m(1, '2026-01-01', 7), m(2, '2026-01-02', 7.1), m(3, '2026-01-03', 7), m(4, '2026-01-04', 7.2)]);
    expect(summarizeRatings(points)!.consistency).toBeNull();
  });
});

describe('ratingYDomain / ratingChartLayout', () => {
  it('tipik seri 6–8, uç değerlerde 5/10\'a açılır, sınırlar 0–10', () => {
    expect(ratingYDomain([6.4, 7.6])).toEqual({ yMin: 6, yMax: 8 });
    expect(ratingYDomain([6.24, 9.01])).toEqual({ yMin: 5, yMax: 10 });
    expect(ratingYDomain([5.3, 7])).toEqual({ yMin: 5, yMax: 8 });
    expect(ratingYDomain([3.1, 9.9])).toEqual({ yMin: 2, yMax: 10 });
    expect(ratingYDomain([])).toEqual({ yMin: 5, yMax: 10 });
  });

  const box = { width: 300, height: 200, padTop: 10, padRight: 10, padBottom: 30, padLeft: 30 };

  it('x eski → yeni soldan sağa; y yüksek reyting yukarıda; ortalama çizgisi', () => {
    const { points } = buildRatingSeries([m(1, '2026-01-01', 6.3), m(2, '2026-01-02', 7.7), m(3, '2026-01-03', 7)]);
    const l = ratingChartLayout(points, box, 7);
    expect([l.yMin, l.yMax]).toEqual([6, 8]);
    expect(l.dots.map((d) => d.x)).toEqual([30, 160, 290]);
    expect(l.dots[1].y).toBeLessThan(l.dots[0].y);
    expect(l.dots[0].y).toBeCloseTo(146, 6); // plot 10..170, 6.3 → alttan %15
    expect(l.dots[1].y).toBeCloseTo(34, 6);
    expect(l.averageY).toBe(90);
    expect(l.ticks.map((t) => t.value)).toEqual([6, 6.5, 7, 7.5, 8]);
    expect(l.linePoints).toBe('30.0,146.0 160.0,34.0 290.0,90.0');
  });

  it('tek maç ortada; geniş aralıkta tam sayı çizgileri', () => {
    const { points } = buildRatingSeries([m(1, '2026-01-01', 9.2)]);
    const l = ratingChartLayout(points, box);
    expect(l.dots[0].x).toBe(160);
    expect(l.averageY).toBeNull();
    expect(l.ticks.map((t) => t.value)).toEqual([6, 7, 8, 9, 10]);
  });
});
