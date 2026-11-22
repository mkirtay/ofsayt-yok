import { describe, expect, it } from 'vitest';
import {
  applyCurve,
  calibratePct,
  calibrateProbabilities,
  calibrateScenarios,
  fitIsotonic,
  MAX_SHIFT,
  pickByLift,
  scenarioMarket,
  type CalibrationMap,
} from './probabilityCalibration';
import { pickTopPredictions } from './analysisTopPicks';
import realMap from '@/config/aiCalibrationMap.json';

const map: CalibrationMap = {
  version: 'test',
  generatedAt: '',
  matches: 100,
  baseRates: { over15: 81, homeToScore: 77, home: 49, away: 35, btts: 51, over25: 58 },
  curves: { over15: [[50, 70], [70, 85], [90, 95]] },
  global: [[20, 25], [50, 60], [80, 88]],
};

describe('isotonic eğri', () => {
  it('azalmayan; büzme az örnekli bloğu ham değere çeker', () => {
    const pts = [
      ...Array.from({ length: 50 }, (_, i) => ({ x: 40, y: i < 20 ? 1 : 0 })),
      ...Array.from({ length: 50 }, (_, i) => ({ x: 70, y: i < 45 ? 1 : 0 })),
      { x: 90, y: 0 },
    ];
    const c = fitIsotonic(pts);
    for (let i = 1; i < c.length; i++) expect(c[i]![1]).toBeGreaterThanOrEqual(c[i - 1]![1]);
    // tek noktalık 90 bloğu 70'le birleşir (ihlal) → aşırı uç yok
    expect(Math.max(...c.map((p) => p[1]))).toBeLessThan(95);
  });

  it('ara değer + ±15 puan sınırı + [%5, %95]', () => {
    expect(applyCurve([[50, 60], [70, 80]], 60)).toBe(70);
    expect(applyCurve([[50, 100]], 50)).toBe(50 + MAX_SHIFT);
    expect(applyCurve([[10, 0]], 8)).toBe(5);
    expect(calibratePct(map, 'over15', 70)).toBe(85); // pazar eğrisi
    expect(calibratePct(map, 'btts', 50)).toBe(60); // eğrisi yok → global
  });

  it('gerçek tablo: ham → kalibre makul (çekingen model yukarı, uçlar sınırda)', () => {
    const m = realMap as unknown as CalibrationMap;
    for (const k of ['home', 'over15', 'homeToScore'] as const) {
      for (const raw of [30, 50, 70]) {
        const c = calibratePct(m, k, raw);
        expect(Math.abs(c - raw)).toBeLessThanOrEqual(MAX_SHIFT);
        expect(c).toBeGreaterThanOrEqual(5);
        expect(c).toBeLessThanOrEqual(95);
      }
    }
  });
});

describe('analiz olasılıklarının kalibrasyonu', () => {
  it('gol pazarları tek tek, maç sonucu üçlüsü toplamı 100; metin alanları aynen', () => {
    const out = calibrateProbabilities(
      { matchPrediction: { home: 50, draw: 25, away: 25, reasoning: 'x' }, goalExpectation: { over15: 70, btts: 50, reasoning: 'y' } },
      map,
    );
    expect(out.goalExpectation).toMatchObject({ over15: 85, btts: 60, reasoning: 'y' });
    const mp = out.matchPrediction as Record<string, number | string>;
    expect((mp.home as number) + (mp.draw as number) + (mp.away as number)).toBe(100);
    expect(mp.reasoning).toBe('x');
  });

  it('senaryolar kartın pazar eğrisiyle: "2+ gol" over15 eğrisinden', () => {
    expect(scenarioMarket('2+ gol')).toBe('over15');
    expect(scenarioMarket('İki takım da gol atar')).toBe('btts');
    expect(scenarioMarket('İlk yarıda gol')).toBe('htOver05');
    expect(scenarioMarket('Ev sahibi kazanır')).toBe('home');
    expect(scenarioMarket('Korner sayısı yüksek')).toBeNull();
    const [a, b] = calibrateScenarios([{ metric: '2+ gol', probability: 70 }, { metric: 'Korner sayısı yüksek', probability: 50 }], map);
    expect(a!.probability).toBe(85);
    expect(b!.probability).toBe(60);
  });
});

describe('öne çıkan 3 tahmin — temel orandan sapan', () => {
  const probs = {
    matchPrediction: { home: 62, draw: 22, away: 16 },
    goalExpectation: { over15: 84, homeToScore: 86, btts: 55, over25: 60 },
  };

  it('≥ %50 iddialardan (olasılık − temel oran) en büyük 3', () => {
    // home 62−49=13, over25 60−58=2, btts 55−51=4, homeToScore 86−77=9, over15 84−81=3
    expect(pickByLift(probs, map.baseRates)).toEqual(['home', 'homeToScore', 'btts']);
  });

  it('kayda yazılan seçim kartta ve isabet sayfasında aynen kullanılır; kayıt yoksa eski kural (en olası 3)', () => {
    const withKeys = { ...probs, fullReport: { topPickKeys: ['home', 'homeToScore', 'btts'] } };
    expect(pickTopPredictions(withKeys).map((p) => p.key)).toEqual(['home', 'homeToScore', 'btts']);
    expect(pickTopPredictions(probs).map((p) => p.key)).toEqual(['homeToScore', 'over15', 'home']);
    // kombine aracı (n=1) her zaman en olası
    expect(pickTopPredictions(withKeys, 1).map((p) => p.key)).toEqual(['homeToScore']);
  });

  it('yetmezse en olasılarla tamamlanır', () => {
    expect(pickByLift({ matchPrediction: { home: 30, draw: 30, away: 40 }, goalExpectation: { over15: 70 } }, map.baseRates)).toEqual(['over15', 'away', 'home']);
  });
});
