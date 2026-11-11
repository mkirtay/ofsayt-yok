import { describe, expect, it } from 'vitest';
import {
  bestPickOfMatch,
  breakEvenProbability,
  calibrationBands,
  comboOdds,
  comboProbability,
  suggestCombo,
  valueEdge,
  RISK_PRESETS,
  type ComboCandidate,
} from './comboPicks';

const c = (matchId: string, pct: number, odd?: number | null): ComboCandidate => ({ matchId, label: matchId, key: 'over15', pct, odd });

describe('bestPickOfMatch', () => {
  it('maçın yalnız en güçlü tek pazarını döndürür', () => {
    const r = bestPickOfMatch({
      matchPrediction: { home: 55, draw: 25, away: 20 },
      goalExpectation: { over15: 82, over25: 61, btts: 58 },
    });
    expect(r).toEqual({ key: 'over15', pct: 82 });
  });
  it('olasılık verisi yoksa null', () => {
    expect(bestPickOfMatch({ matchPrediction: null, goalExpectation: null })).toBeNull();
  });
});

describe('kombine matematiği', () => {
  it('olasılık çarpımı', () => {
    expect(comboProbability([80, 70])).toBeCloseTo(0.56, 10);
    expect(comboProbability([90, 90, 90])).toBeCloseTo(0.729, 10);
    expect(comboProbability([])).toBe(0);
  });
  it('oran çarpımı; eksik / geçersiz → null', () => {
    expect(comboOdds([1.5, 2])).toBeCloseTo(3, 10);
    expect(comboOdds([1.5, null])).toBeNull();
    expect(comboOdds([1.0, 2])).toBeNull();
    expect(comboOdds([])).toBeNull();
  });
  it('başabaş olasılığı ve değer farkı', () => {
    expect(breakEvenProbability(4)).toBeCloseTo(0.25, 10);
    expect(valueEdge(0.5, 2)).toBeCloseTo(0, 10);
    expect(valueEdge(0.4, 2)).toBeCloseTo(-0.2, 10);
  });
  it('oran arttıkça (maç eklendikçe) olasılık düşer', () => {
    const p = [85, 80, 75, 70, 65];
    const probs = p.map((_, i) => comboProbability(p.slice(0, i + 1)));
    for (let i = 1; i < probs.length; i++) expect(probs[i]).toBeLessThan(probs[i - 1]);
  });
});

describe('suggestCombo', () => {
  const cands = [c('a', 90, 1.1), c('b', 82, 1.25), c('c', 75, 1.5), c('d', 66, 1.9), c('e', 58, 2.4)];
  it('hedef oransız: eşiği geçenlerin en güçlü N tanesi', () => {
    const r = suggestCombo(cands, { minPct: 70, maxMatches: 2 });
    expect(r.picks.map((p) => p.matchId)).toEqual(['a', 'b']);
  });
  it('eşiği geçen yoksa no-candidates', () => {
    expect(suggestCombo(cands, { minPct: 95, maxMatches: 3 })).toEqual({ picks: [], reason: 'no-candidates' });
  });
  it('hedef oran: hedefe ulaşan en yüksek olasılıklı küme', () => {
    const r = suggestCombo(cands, { minPct: 50, maxMatches: 4, targetOdds: 3 });
    const odds = comboOdds(r.picks.map((p) => p.odd))!;
    expect(odds).toBeGreaterThanOrEqual(3);
    // Brute force ile doğrulama
    let best = 0;
    for (let m = 1; m < 1 << cands.length; m++) {
      const sel = cands.filter((_, i) => m & (1 << i));
      if (sel.length > 4) continue;
      if ((comboOdds(sel.map((s) => s.odd)) ?? 0) < 3) continue;
      best = Math.max(best, comboProbability(sel.map((s) => s.pct)));
    }
    expect(comboProbability(r.picks.map((p) => p.pct))).toBeCloseTo(best, 10);
  });
  it('daha yüksek hedef oran → olasılık düşer', () => {
    const lo = suggestCombo(cands, { minPct: 50, maxMatches: 5, targetOdds: 2 });
    const hi = suggestCombo(cands, { minPct: 50, maxMatches: 5, targetOdds: 6 });
    expect(comboProbability(hi.picks.map((p) => p.pct))).toBeLessThan(comboProbability(lo.picks.map((p) => p.pct)));
  });
  it('ulaşılamayan hedef: target-unreachable + ulaşılabilen en yüksek oran', () => {
    const r = suggestCombo(cands, { minPct: 70, maxMatches: 2, targetOdds: 50 });
    expect(r.reason).toBe('target-unreachable');
    expect(r.maxReachableOdds).toBeCloseTo(1.25 * 1.5, 10); // b + c (a·b=1.375, a·c=1.65, b·c=1.875)
  });
  it('oranı olmayan adaylar hedef oranlı aramada dışarıda', () => {
    const r = suggestCombo([c('x', 90), c('y', 80, 2)], { minPct: 50, maxMatches: 2, targetOdds: 1.5 });
    expect(r.picks.map((p) => p.matchId)).toEqual(['y']);
  });
  it('risk ön ayarları: güvenli < dengeli < riskli (eşik düşer, maç sayısı artar)', () => {
    expect(RISK_PRESETS.safe.minPct).toBeGreaterThan(RISK_PRESETS.balanced.minPct);
    expect(RISK_PRESETS.balanced.minPct).toBeGreaterThan(RISK_PRESETS.bold.minPct);
    expect(RISK_PRESETS.safe.maxMatches).toBeLessThan(RISK_PRESETS.bold.maxMatches);
  });
});

describe('calibrationBands', () => {
  it('bantlara böler; hit null sayılmaz; oran yuvarlanır', () => {
    const bands = calibrationBands([
      { pct: 82, hit: true },
      { pct: 85, hit: false },
      { pct: 88, hit: true },
      { pct: 61, hit: true },
      { pct: 66, hit: null },
    ]);
    const b80 = bands.find((b) => b.min === 80)!;
    expect(b80).toMatchObject({ matches: 3, hits: 2, rate: 66.7 });
    expect(bands.find((b) => b.min === 60)).toMatchObject({ matches: 1, hits: 1, rate: 100 });
    expect(bands.find((b) => b.min === 70)).toMatchObject({ matches: 0, rate: null });
  });
});
