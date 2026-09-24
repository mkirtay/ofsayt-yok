import { describe, expect, it } from 'vitest';
import type { PlayerLineupRow } from '@/utils/playerVs';
import {
  buildRatingSeries,
  consistencyOf,
  ratingChartLayout,
  ratingYDomain,
  standardDeviation,
  summarizeRatings,
} from './ratingTrend';

/** Gün sırası `n` olan satır; varsayılan: ilk 11, 90', takım 1. */
const m = (n: number, rating?: number, p: Partial<PlayerLineupRow> = {}): PlayerLineupRow => ({
  fixtureId: n,
  date: `2026-01-${String(n).padStart(2, '0')} 18:00:00`,
  leagueId: 600,
  teamId: 1,
  teamName: 'Eski Takım',
  opponentId: 100 + n,
  opponentName: `Rakip ${n}`,
  isHome: n % 2 === 0,
  goalsFor: 2,
  goalsAgainst: 1,
  started: true,
  minutes: 90,
  ...(rating !== undefined ? { rating } : {}),
  ...p,
});
const bench = (n: number) => m(n, undefined, { started: false, minutes: undefined });

describe('buildRatingSeries — oyuncunun kendi son 20 maçı', () => {
  it('sahaya çıktığı son 20 maç; kadroda olup oynamadığı maçlar sayılmaz; eski → yeni', () => {
    // 25 günün 3'ünde yedekte kaldı (oynamadı), 2'sinde oynadı ama reyting yok; sıra karışık
    const rows = Array.from({ length: 28 }, (_, i) => i + 1).map((n) =>
      [4, 10, 27].includes(n) ? bench(n) : [12, 20].includes(n) ? m(n) : m(n, 6 + (n % 5) * 0.3),
    );
    rows.push(rows.shift()!);
    const s = buildRatingSeries(rows);
    expect(s.considered).toBe(20);
    expect(s.missing).toBe(2); // yalnızca OYNAYIP reytingi gelmeyen 12 ve 20
    expect(s.points).toHaveLength(18);
    expect(s.points.map((p) => p.matchId)).not.toContain(27); // son maçlardan biri ama yedekte kaldı
    expect(s.points[0].matchId).toBe(7); // oynanan son 20: 7..28 (10 ve 27 hariç)
    expect(s.points.at(-1)!.matchId).toBe(28);
  });

  it('transfer eden oyuncu: takımdan bağımsız, eski takımdaki maçlar da seride', () => {
    const rows = [
      m(1, 6.8, { teamId: 1, teamName: 'Eski Takım' }),
      m(2, 7.1, { teamId: 1, teamName: 'Eski Takım' }),
      m(3, 7.4, { teamId: 2, teamName: 'Yeni Takım' }),
    ];
    const s = buildRatingSeries(rows);
    expect(s.points.map((p) => p.matchId)).toEqual([1, 2, 3]);
    expect(s.missing).toBe(0);
  });

  it('skor ev-dep sırasıyla; tarih gün olarak', () => {
    const [home, away] = buildRatingSeries([m(2, 7, { goalsFor: 3, goalsAgainst: 0 }), m(3, 7, { goalsFor: 3, goalsAgainst: 0 })]).points;
    expect(home).toMatchObject({ date: '2026-01-02', isHome: true, score: '3-0' });
    expect(away).toMatchObject({ isHome: false, score: '0-3' });
  });
});

describe("15' kuralı", () => {
  const rows = [
    m(1, 7.0),
    m(2, 7.2),
    m(3, 9.5, { started: false, minutes: 8 }), // kısa giriş: yüksek reyting "en iyi" OLMAZ
    m(4, 6.8),
    m(5, 7.1),
    m(6, 4.0, { started: false, minutes: 14 }), // kısa giriş: "en kötü" OLMAZ
    m(7, 7.3),
  ];

  it('kısa girişler noktada var, işaretli; sayısı ayrı', () => {
    const s = buildRatingSeries(rows);
    expect(s.points).toHaveLength(7);
    expect(s.points.filter((p) => p.short).map((p) => p.matchId)).toEqual([3, 6]);
    expect(s.shortCount).toBe(2);
    expect(s.points.find((p) => p.matchId === 3)).toMatchObject({ minutes: 8, short: true });
  });

  it('ortalama, en iyi/en kötü, σ ve istikrar yalnızca 15\'+ maçlardan', () => {
    const summary = summarizeRatings(buildRatingSeries(rows).points)!;
    expect(summary.average).toBeCloseTo((7.0 + 7.2 + 6.8 + 7.1 + 7.3) / 5, 6);
    expect(summary.best.matchId).toBe(7);
    expect(summary.worst.matchId).toBe(4);
    expect(summary.consistency).toBe('stable'); // 5 katılan maç, σ ≈ 0.17
  });

  it('katılan maç < 5 → istikrar yok (kısa girişler sayıya eklenmez)', () => {
    const summary = summarizeRatings(buildRatingSeries(rows.slice(0, 6)).points)!;
    expect(summary.consistency).toBeNull(); // 6 noktanın 4'ü katılıyor
  });

  it('yalnızca kısa girişler → özet null (grafik yine çizilir)', () => {
    const s = buildRatingSeries([m(1, 7, { started: false, minutes: 5 })]);
    expect(s.points).toHaveLength(1);
    expect(summarizeRatings(s.points)).toBeNull();
  });

  it('14. dakika kısa, 15. dakika katılır', () => {
    const s = buildRatingSeries([m(1, 7, { started: false, minutes: 14 }), m(2, 7, { started: false, minutes: 15 })]);
    expect(s.points.map((p) => p.short)).toEqual([true, false]);
  });
});

describe('istikrar (σ) eşikleri — değişmedi', () => {
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
    const { points } = buildRatingSeries([m(1, 6.3), m(2, 7.7), m(3, 7)]);
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
    const { points } = buildRatingSeries([m(1, 9.2)]);
    const l = ratingChartLayout(points, box);
    expect(l.dots[0].x).toBe(160);
    expect(l.averageY).toBeNull();
    expect(l.ticks.map((t) => t.value)).toEqual([6, 7, 8, 9, 10]);
  });
});
