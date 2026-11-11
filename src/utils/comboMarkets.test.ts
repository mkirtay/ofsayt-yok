import { describe, expect, it } from 'vitest';
import { blendPct, comboMarketHit, comboMarketPcts, devigPair, fairOdds, COMBO_MARKETS, OPPOSITE, MODEL_WEIGHT } from './comboMarkets';

describe('comboMarkets', () => {
  it('model olasılıkları: alt = 100 − üst, KG yok = 100 − KG var; eksik çizgi atlanır', () => {
    const m = comboMarketPcts({ goalExpectation: { over15: 82, over25: 61.4, btts: 55 } });
    expect(m).toEqual([
      { key: 'over15', pct: 82 },
      { key: 'under15', pct: 18 },
      { key: 'over25', pct: 61 },
      { key: 'under25', pct: 39 },
      { key: 'btts', pct: 55 },
      { key: 'bttsNo', pct: 45 },
    ]);
    expect(comboMarketPcts({ goalExpectation: { over15: 'x', over25: 140 } })).toEqual([]);
    expect(comboMarketPcts({})).toEqual([]);
  });

  it('skordan isabet', () => {
    const s = (h: number, a: number) => ({ home: h, away: a });
    expect(comboMarketHit('over15', s(1, 1))).toBe(true);
    expect(comboMarketHit('under15', s(1, 0))).toBe(true);
    expect(comboMarketHit('over25', s(2, 0))).toBe(false);
    expect(comboMarketHit('under25', s(2, 0))).toBe(true);
    expect(comboMarketHit('over35', s(2, 2))).toBe(true);
    expect(comboMarketHit('under35', s(3, 1))).toBe(false);
    expect(comboMarketHit('btts', s(1, 0))).toBe(false);
    expect(comboMarketHit('bttsNo', s(0, 0))).toBe(true);
    expect(comboMarketHit('btts', null)).toBeNull();
    // Her skor için bir pazar ve karşıtı tam olarak birbirini tamamlar.
    for (const key of COMBO_MARKETS) for (const [h, a] of [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1], [2, 2]]) expect(comboMarketHit(key, s(h, a))).toBe(!comboMarketHit(OPPOSITE[key], s(h, a)));
  });

  it('harman, adil oran, marj temizleme', () => {
    expect(blendPct(80, 60, 0.25)).toBe(65);
    expect(blendPct(80, null, 0.25)).toBe(80);
    expect(blendPct(80, 60, 2)).toBe(80);
    expect(fairOdds(64)).toBe(1.56);
    expect(fairOdds(80)).toBe(1.25);
    expect(devigPair(1.9, 1.9)).toBeCloseTo(50);
    expect(devigPair(1.3, 3.4)).toBeCloseTo(72.3, 1);
    expect(devigPair(1, 2)).toBeNull();
    expect(Object.keys(MODEL_WEIGHT).sort()).toEqual([...COMBO_MARKETS].sort());
  });
});
