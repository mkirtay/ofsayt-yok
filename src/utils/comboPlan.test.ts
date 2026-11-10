import { describe, expect, it } from 'vitest';
import {
  adviseType,
  comb,
  parseStake,
  parseMisli,
  effectiveUnit,
  parseTargetOdds,
  riskToMaxMatches,
  riskToMinPct,
  riskToTargetOdds,
  straightOutcome,
  suggestForRisk,
  systemOutcome,
} from './comboPlan';
import type { ComboCandidate } from './comboPicks';

const c = (id: string, pct: number, odd: number): ComboCandidate => ({ matchId: id, label: id, key: 'over15', pct, odd });

describe('girdi doğrulama', () => {
  it('tutar: TL biçimleri kabul; negatif / sıfır / aşırı / metin reddedilir', () => {
    expect(parseStake('2000')).toBe(2000);
    expect(parseStake('2.000,50')).toBe(2000.5);
    expect(parseStake('2.000')).toBe(2000);
    expect(parseStake('150 TL')).toBe(150);
    expect(parseStake(99.5)).toBe(99.5);
    for (const bad of ['', '-5', '0', 'abc', '1e9', '1000001', '12,345', null, undefined, '1.5.5']) expect(parseStake(bad as never)).toBeNull();
  });
  it('hedef oran: 1 < oran ≤ 1000', () => {
    expect(parseTargetOdds('1,7')).toBe(1.7);
    expect(parseTargetOdds('20')).toBe(20);
    for (const bad of ['1', '0,5', '-3', 'x', '1001', '']) expect(parseTargetOdds(bad)).toBeNull();
  });
});

describe('misli (çarpan)', () => {
  it('tamsayı 1–1000; boş → 1; ondalık / negatif / sıfır / metin / aşırı reddedilir', () => {
    expect(parseMisli('')).toBe(1);
    expect(parseMisli(null)).toBe(1);
    expect(parseMisli('5')).toBe(5);
    expect(parseMisli(1000)).toBe(1000);
    for (const bad of ['0', '-2', '1,5', '2.5', 'x', '1001', '1e3']) expect(parseMisli(bad)).toBeNull();
  });
  it('birim tutar = tutar × misli; geçersiz ya da aşırı büyükse null', () => {
    expect(effectiveUnit(2000, 3)).toBe(6000);
    expect(effectiveUnit(99.99, 3)).toBe(299.97);
    expect(effectiveUnit(null, 3)).toBeNull();
    expect(effectiveUnit(2000, null)).toBeNull();
    expect(effectiveUnit(1_000_000, 1000)).toBeNull();
  });
  it('düz kombinede getiri misliyle çarpılır; sistemde toplam yatırım = kombinasyon × tutar × misli', () => {
    const legs = [{ p: 0.8, odd: 1.5 }, { p: 0.7, odd: 2 }, { p: 0.6, odd: 2.5 }];
    const unit = effectiveUnit(100, 3)!;
    const s = systemOutcome(legs, 2, unit)!;
    expect(s.totalStake).toBe(3 * 300); // C(3,2)=3 kombinasyon × (100 TL × 3 misli)
    const one = systemOutcome(legs, 2, 100)!;
    expect(s.expectedReturn).toBeCloseTo(one.expectedReturn * 3, 6);
    expect(s.expectedProfit).toBeCloseTo(one.expectedProfit * 3, 6);
    expect(s.profitProbability).toBeCloseTo(one.profitProbability, 10); // olasılıklar misliden bağımsız
    const st = straightOutcome([c('a', 80, 1.5), c('b', 70, 2)], unit)!;
    expect(st.potentialReturn).toBeCloseTo(300 * 3, 8);
  });
});

describe('risk yüzdesi', () => {
  it('risk arttıkça eşik düşer, maç sayısı ve varsayılan hedef oran artar', () => {
    expect(riskToMinPct(0)).toBe(85);
    expect(riskToMinPct(100)).toBe(55);
    expect(riskToMaxMatches(0)).toBe(2);
    expect(riskToMaxMatches(100)).toBe(8);
    expect(riskToTargetOdds(0)).toBe(1.7);
    expect(riskToTargetOdds(100)).toBeCloseTo(10.2, 1);
    for (let r = 10; r <= 100; r += 10) {
      expect(riskToMinPct(r)).toBeLessThanOrEqual(riskToMinPct(r - 10));
      expect(riskToTargetOdds(r)).toBeGreaterThan(riskToTargetOdds(r - 10));
    }
    expect(riskToMinPct(-50)).toBe(85);
    expect(riskToMinPct(999)).toBe(55);
  });

  it('örnek: hedef 1,7 → az maç, yüksek olasılık; hedef 20 → çok maç, düşük olasılık; eşik gerekirse gevşer', () => {
    const pool = [c('a', 90, 1.12), c('b', 86, 1.2), c('c', 82, 1.3), c('d', 78, 1.45), c('e', 72, 1.7), c('f', 66, 2.0), c('g', 62, 2.3), c('h', 58, 2.6)];
    const low = suggestForRisk(pool, { risk: 0, maxMatches: 8, targetOdds: 1.7 });
    const high = suggestForRisk(pool, { risk: 100, maxMatches: 8, targetOdds: 20 });
    const prob = (r: { picks: ComboCandidate[] }) => r.picks.reduce((p, x) => (p * x.pct) / 100, 1);
    const odds = (r: { picks: ComboCandidate[] }) => r.picks.reduce((o, x) => o * (x.odd as number), 1);
    expect(odds(low)).toBeGreaterThanOrEqual(1.7);
    expect(odds(high)).toBeGreaterThanOrEqual(20);
    expect(low.picks.length).toBeLessThan(high.picks.length);
    expect(prob(high)).toBeLessThan(prob(low));
    // %85 eşiğinde yalnız a, b var (1,12 × 1,2 = 1,34 < 1,7) → eşik gevşetildi.
    expect(low.relaxed).toBe(true);
    expect(low.usedMinPct).toBeLessThan(85);
    expect(low.picks.every((p) => p.pct >= low.usedMinPct)).toBe(true);
  });

  it('hedef yoksa yalnız eşik + maç sayısı; ulaşılamayan hedef → boş + en yüksek ulaşılabilen oran', () => {
    const pool = [c('a', 90, 1.1), c('b', 86, 1.2), c('c', 70, 1.5)];
    const r = suggestForRisk(pool, { risk: 0 });
    expect(r.picks.map((p) => p.matchId)).toEqual(['a', 'b']);
    expect(r.relaxed).toBe(false);
    const none = suggestForRisk(pool, { risk: 50, targetOdds: 500 });
    expect(none.picks).toEqual([]);
    expect(none.reason).toBe('target-unreachable');
  });
});

describe('düz kombine özeti', () => {
  it('tutar × oran = olası getiri; beklenen değer; başabaş', () => {
    const r = straightOutcome([c('a', 80, 1.5), c('b', 70, 2)], 2000)!;
    expect(r.odds).toBeCloseTo(3, 10);
    expect(r.potentialReturn).toBeCloseTo(6000, 6);
    expect(r.probability).toBeCloseTo(0.56, 10);
    expect(r.breakEven).toBeCloseTo(1 / 3, 10);
    expect(r.expectedProfit).toBeCloseTo(0.56 * 6000 - 2000, 6);
  });
  it('oran eksikse / tutar geçersizse null', () => {
    expect(straightOutcome([{ ...c('a', 80, 1.5), odd: null }], 100)).toBeNull();
    expect(straightOutcome([c('a', 80, 1.5)], 0)).toBeNull();
  });
});

describe('sistem (n maçtan k doğru)', () => {
  it('kombinasyon sayısı', () => {
    expect(comb(3, 2)).toBe(3);
    expect(comb(8, 4)).toBe(70);
    expect(comb(4, 5)).toBe(0);
  });

  it('k = n düz kombineyle aynı: tek kombinasyon, beklenen getiri = p·oran·birim', () => {
    const legs = [{ p: 0.8, odd: 1.5 }, { p: 0.7, odd: 2 }];
    const s = systemOutcome(legs, 2, 100)!;
    expect(s.combinations).toBe(1);
    expect(s.totalStake).toBe(100);
    expect(s.expectedReturn).toBeCloseTo(0.56 * 3 * 100, 8);
    expect(s.anyHitProbability).toBeCloseTo(0.56, 10);
    expect(s.profitProbability).toBeCloseTo(0.56, 10); // 300 > 100
    expect(s.maxReturn).toBeCloseTo(300, 8);
  });

  it('2/3 sistem: elle hesaplanan dağılım', () => {
    const legs = [{ p: 0.8, odd: 1.5 }, { p: 0.7, odd: 2 }, { p: 0.6, odd: 2.5 }];
    const s = systemOutcome(legs, 2, 100)!;
    expect(s.combinations).toBe(3);
    expect(s.totalStake).toBe(300);
    // Çiftlerin getirisi: AB=3, AC=3.75, BC=5. Beklenen getiri = Σ çift p × getiri × 100.
    const exp = 100 * (0.8 * 0.7 * 3 + 0.8 * 0.6 * 3.75 + 0.7 * 0.6 * 5);
    expect(s.expectedReturn).toBeCloseTo(exp, 8);
    expect(s.expectedProfit).toBeCloseTo(exp - 300, 8);
    // ≥ 2 maç tutma olasılığı
    const p = [0.8, 0.7, 0.6];
    const two = p[0] * p[1] * (1 - p[2]) + p[0] * p[2] * (1 - p[1]) + p[1] * p[2] * (1 - p[0]) + p[0] * p[1] * p[2];
    expect(s.anyHitProbability).toBeCloseTo(two, 10);
    // Kâr: yalnız iki maç tutarsa getiri 300 (AB) vs 375 (AC) vs 500 (BC) → AB tek başına 300 = yatırım → kâr değil; üçü de tutarsa 1175 > 300.
    const profit = p[0] * p[2] * (1 - p[1]) + p[1] * p[2] * (1 - p[0]) + p[0] * p[1] * p[2];
    expect(s.profitProbability).toBeCloseTo(profit, 10);
    expect(s.maxReturn).toBeCloseTo(100 * (3 + 3.75 + 5), 8);
  });

  it('olasılıklar tutarlı: p=1 ise getiri kesin; 8 maç için de çalışır, 9 reddedilir', () => {
    const sure = systemOutcome([{ p: 1, odd: 2 }, { p: 1, odd: 3 }], 2, 10)!;
    expect(sure.expectedReturn).toBeCloseTo(60, 8);
    expect(sure.anyHitProbability).toBe(1);
    const eight = Array.from({ length: 8 }, () => ({ p: 0.7, odd: 1.6 }));
    const s = systemOutcome(eight, 5, 10)!;
    expect(s.combinations).toBe(56);
    expect(s.anyHitProbability).toBeGreaterThan(0.5);
    expect(systemOutcome([...eight, { p: 0.7, odd: 1.6 }], 5, 10)).toBeNull();
  });

  it('geçersiz girdi → null', () => {
    expect(systemOutcome([{ p: 0.5, odd: 1 }], 1, 10)).toBeNull();
    expect(systemOutcome([{ p: 1.2, odd: 2 }], 1, 10)).toBeNull();
    expect(systemOutcome([{ p: 0.5, odd: 2 }], 2, 10)).toBeNull();
    expect(systemOutcome([{ p: 0.5, odd: 2 }], 1, -5)).toBeNull();
  });
});

describe('adviseType', () => {
  it('az maç / temkinli risk → düz; iddialı + ≥ 4 maç → sistem (n−1); küçük tutarda düz', () => {
    expect(adviseType(2, 80, 500)).toMatchObject({ type: 'straight', reason: 'fewLegs' });
    expect(adviseType(5, 20, 500)).toMatchObject({ type: 'straight', reason: 'lowRisk' });
    expect(adviseType(5, 80, 500)).toEqual({ type: 'system', k: 4, reason: 'highRisk' });
    expect(adviseType(5, 80, 10)).toMatchObject({ type: 'straight', reason: 'smallStake' });
    expect(adviseType(9, 80, 500).type).toBe('straight');
  });
});
