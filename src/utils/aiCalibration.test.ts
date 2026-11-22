import { describe, expect, it } from 'vitest';
import { computeCalibration, expectedBaseRate, marketBaseRates, type CalibrationMatch } from './aiCalibration';

/** 4 maç: 2+ gol 3'ünde oldu (temel %75), ev sahibi galibiyeti 1'inde (temel %25). */
const matches: CalibrationMatch[] = [
  { picks: [{ key: 'over15', pct: 80, hit: true }, { key: 'home', pct: 60, hit: true }], outcomes: { over15: true, home: true } },
  { picks: [{ key: 'over15', pct: 80, hit: true }], outcomes: { over15: true, home: false } },
  { picks: [{ key: 'over15', pct: 80, hit: true }], outcomes: { over15: true, home: false } },
  { picks: [{ key: 'over15', pct: 80, hit: false }, { key: 'home', pct: 40, hit: null }], outcomes: { over15: false, home: false } },
];

describe('AI kalibrasyonu — temel orana karşı', () => {
  it('temel oran: pazarın TÜM maçlarda gerçekleşme sıklığı (model seçmese de)', () => {
    const b = marketBaseRates(matches);
    expect(b.get('over15')).toEqual({ rate: 75, sample: 4 });
    expect(b.get('home')).toEqual({ rate: 25, sample: 4 });
  });

  it('beklenen isabet: seçilen rozetlerin temel oran ortalaması; sonucu bilinmeyen rozet sayılmaz', () => {
    const picks = matches.flatMap((m) => m.picks);
    // 4 × over15 (75) + 1 × home (25) → 65; null olan home dışarıda
    expect(expectedBaseRate(picks, marketBaseRates(matches))).toBe(65);
  });

  it('özet: gösterilen ort., gerçekleşme, temel oran, Brier ve beceri', () => {
    const c = computeCalibration(matches)!;
    expect(c.picks).toBe(5);
    expect(c.avgShown).toBe(76); // (80×4 + 60) / 5
    expect(c.actualRate).toBe(80); // 4/5
    expect(c.baseRate).toBe(65);
    // Brier: 3×(0,8−1)² + (0,8−0)² + (0,6−1)² = 0,12 + 0,64 + 0,16 = 0,92 → /5
    expect(c.brier).toBe(0.184);
    // Temel: 3×(0,75−1)² + (0,75)² + (0,25−1)² = 0,1875 + 0,5625 + 0,5625 = 1,3125 → /5
    expect(c.brierBase).toBe(0.263);
    expect(c.skill).toBeGreaterThan(0);
  });

  it('bantlar: gösterilen ortalama ve gerçekleşme; boş bant null', () => {
    const c = computeCalibration(matches)!;
    const b80 = c.bands.find((b) => b.label === '%80–89')!;
    expect(b80).toMatchObject({ picks: 4, avgShown: 80, rate: 75 });
    expect(c.bands.find((b) => b.label === '%90+')).toMatchObject({ picks: 0, avgShown: null, rate: null });
  });

  it('pazar tablosu: en çok seçilen önce, isabet ve temel oran yan yana', () => {
    const c = computeCalibration(matches)!;
    expect(c.markets[0]).toEqual({ key: 'over15', picks: 4, hitRate: 75, baseRate: 75, baseSample: 4 });
    expect(c.markets[1]).toMatchObject({ key: 'home', picks: 1, hitRate: 100, baseRate: 25 });
  });

  it('değerlendirilmiş rozet yoksa null', () => {
    expect(computeCalibration([])).toBeNull();
    expect(computeCalibration([{ picks: [{ key: 'over15', pct: 80, hit: null }], outcomes: {} }])).toBeNull();
  });
});

describe('turnuva grubu', () => {
  it('Süper Lig, 1. Lig/Kupa, Avrupa, büyük 5, milli (2e9+), diğer', async () => {
    const { competitionGroup } = await import('./aiCalibration');
    expect(competitionGroup('600', '19746547')).toBe('superLig');
    expect(competitionGroup('603', '1')).toBe('turkey');
    expect(competitionGroup('606', '1')).toBe('turkey');
    expect(competitionGroup('2', '1')).toBe('uefa');
    expect(competitionGroup('82', '1')).toBe('big5');
    expect(competitionGroup('2000000005', '2001528958')).toBe('national');
    expect(competitionGroup(null, '2001528958')).toBe('national');
    expect(competitionGroup('648', '1')).toBe('other');
  });
});
