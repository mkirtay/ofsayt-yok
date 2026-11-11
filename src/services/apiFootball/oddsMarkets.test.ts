import { describe, expect, it } from 'vitest';
import { marketOdd, MARKET_SPECS, type AfOddsEntry } from './oddsMarkets';
import slOdds from './__fixtures__/oddsSuperLig_1584458.json';
import uclOdds from './__fixtures__/oddsUcl_1635726.json';
import natOdds from './__fixtures__/oddsNationalOnly1xBet_1528991.json';
import emptyOdds from './__fixtures__/oddsEmpty_1545657.json';
import type { MarketKey } from "./oddsMarkets";

const sl = (slOdds as { response: AfOddsEntry[] }).response[0];
const ucl = (uclOdds as { response: AfOddsEntry[] }).response[0];
const nat = (natOdds as { response: AfOddsEntry[] }).response[0];

describe('marketOdd — gerçek AF yanıtları (Süper Lig 1584458, UCL 1635726)', () => {
  it('Süper Lig: Bet365 değerleri (1X2, alt/üst, KG, ilk yarı, takım toplamı)', () => {
    expect(marketOdd(sl, 'home')).toMatchObject({ odd: 1.17, bookmaker: 'Bet365' });
    expect(marketOdd(sl, 'draw')?.odd).toBe(7.5);
    expect(marketOdd(sl, 'away')?.odd).toBe(13);
    expect(marketOdd(sl, 'over15')?.odd).toBe(1.08);
    expect(marketOdd(sl, 'over25')?.odd).toBe(1.3);
    expect(marketOdd(sl, 'over35')?.odd).toBe(1.8);
    expect(marketOdd(sl, 'btts')?.odd).toBe(1.8);
    expect(marketOdd(sl, 'bttsFirstHalf')?.odd).toBe(4);
    expect(marketOdd(sl, 'htOver15')?.odd).toBe(1.83);
  });

  it('her pazar anahtarı Süper Lig ve UCL maçında bir oran döndürür', () => {
    for (const key of Object.keys(MARKET_SPECS) as MarketKey[]) {
      for (const entry of [sl, ucl]) {
        const m = marketOdd(entry, key);
        expect(m, `${key}`).not.toBeNull();
        expect(m!.odd).toBeGreaterThan(1);
        expect(m!.bookmakers).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('ev/deplasman gol bulur: Total - Home/Away Over 0.5; yoksa Clean Sheet yedeği', () => {
    expect(marketOdd(sl, 'homeToScore')?.odd).toBeGreaterThan(1);
    // Bet365 dışındaki bookmaker'lardan bet 16 çıkarılınca yedek (Clean Sheet - Away: No) devreye girer.
    const only365: AfOddsEntry = {
      ...sl,
      bookmakers: sl.bookmakers
        .filter((b) => b.id === 8)
        .map((b) => ({ ...b, bets: b.bets.filter((x) => x.id !== 16 && x.id !== 17) })),
    };
    const fb = marketOdd(only365, 'homeToScore');
    const cleanSheetAwayNo = only365.bookmakers[0].bets.find((b) => b.id === 28)!.values.find((v) => v.value === 'No')!;
    expect(fb?.odd).toBe(Number(cleanSheetAwayNo.odd));
    const fbAway = marketOdd(only365, 'awayToScore');
    const cleanSheetHomeNo = only365.bookmakers[0].bets.find((b) => b.id === 27)!.values.find((v) => v.value === 'No')!;
    expect(fbAway?.odd).toBe(Number(cleanSheetHomeNo.odd));
  });

  it('tercih edilen bookmaker yoksa sıradaki; medyan tüm sunanlardan', () => {
    const noBet365: AfOddsEntry = { ...sl, bookmakers: sl.bookmakers.filter((b) => b.id !== 8) };
    const m = marketOdd(noBet365, 'over25')!;
    expect(m.bookmaker).not.toBe('Bet365');
    expect(m.bookmakers).toBeGreaterThanOrEqual(2);
    expect(m.median).toBeGreaterThan(1);
  });

  it('milli maç (tek bookmaker 1xBet): 1.5 üstü yoksa da diğer pazarlar çalışır; olmayan pazar null', () => {
    expect(nat.bookmakers).toHaveLength(1);
    expect(marketOdd(nat, 'over25')?.bookmaker).toBe('1xBet');
    const has15 = nat.bookmakers[0].bets.find((b) => b.id === 5)!.values.some((v) => v.value === 'Over 1.5');
    expect(marketOdd(nat, 'over15') !== null).toBe(has15);
    expect(marketOdd(nat, 'homeToScore')).not.toBeUndefined();
  });

  it('oran yok / bozuk değer → null', () => {
    expect((emptyOdds as { response: unknown[] }).response).toHaveLength(0);
    expect(marketOdd(null, 'home')).toBeNull();
    const broken: AfOddsEntry = {
      fixture: { id: 1 },
      bookmakers: [{ id: 8, name: 'Bet365', bets: [{ id: 1, name: 'Match Winner', values: [{ value: 'Home', odd: '0.9' }, { value: 'Draw', odd: 'x' }] }] }],
    };
    expect(marketOdd(broken, 'home')).toBeNull();
    expect(marketOdd(broken, 'draw')).toBeNull();
  });
});

import { extractMatchOdds } from './oddsMarkets';

describe('extractMatchOdds (maç detayı kartı) — gerçek AF yanıtları', () => {
  it('Süper Lig (Bet365): Maç Sonucu, Çifte Şans, İlk Yarı, Beraberlikte İade, KG, Toplam Gol 0.5–8.5, Handikap', () => {
    const v = extractMatchOdds(sl)!;
    expect(v.bookmaker).toBe('Bet365');
    expect(v.result).toEqual({ home: 1.17, draw: 7.5, away: 13 });
    expect(v.doubleChance).toEqual({ homeDraw: 1.05, drawAway: expect.any(Number), homeAway: 1.1 });
    expect(v.doubleChance!.drawAway).toBeGreaterThan(1);
    expect(v.firstHalf).toEqual({ home: 1.5, draw: 3.2, away: 9.5 });
    expect(v.drawNoBet).toEqual({ home: 1.05, away: 11 });
    expect(v.btts).toEqual({ yes: 1.8, no: 1.91 });
    // Yalnız iki yönü de gelen çizgiler (0.5–8.5 aralığı; eksik yönlü çizgi atlanır).
    const lines = v.totals.map((t) => t.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(lines.slice(0, 4)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(lines.length).toBeGreaterThanOrEqual(7);
    expect(Math.max(...lines)).toBeLessThanOrEqual(8.5);
    expect(v.totals.find((t) => t.line === 2.5)).toEqual({ line: 2.5, over: 1.3, under: 3.5 });
    for (const t of v.totals) expect(t.over).toBeGreaterThan(1);
    expect(v.handicap).toHaveLength(5);
    expect(v.handicap.map((h) => h.line)).toEqual([...v.handicap.map((h) => h.line)].sort((a, b) => a - b));
    for (const h of v.handicap) expect(h.home > 1 && h.away > 1).toBe(true);
  });

  it('UCL maçında da aynı pazarlar gelir', () => {
    const v = extractMatchOdds(ucl)!;
    expect(v.result && v.doubleChance && v.firstHalf && v.btts).toBeTruthy();
    expect(v.totals.length).toBeGreaterThan(3);
    expect(v.handicap.length).toBeGreaterThan(0);
  });

  it('milli maç (yalnız 1xBet): Beraberlikte İade yok, 1.5 çizgisi yok, çeyrek çizgiler var; olmayan bölüm alanı yok', () => {
    const v = extractMatchOdds(nat)!;
    expect(v.bookmaker).toBe('1xBet');
    expect(v.drawNoBet).toBeUndefined();
    expect(v.result).toBeDefined();
    expect(v.doubleChance).toBeDefined();
    expect(v.totals.some((t) => t.line === 1.5)).toBe(false);
    expect(v.totals.some((t) => t.line === 2.5)).toBe(true);
    expect(v.totals.some((t) => t.line === 3)).toBe(true);
  });

  it('bookmaker tercihi: Bet365 yoksa sıradaki; veri yok → null', () => {
    const without365: AfOddsEntry = { ...sl, bookmakers: sl.bookmakers.filter((b) => b.id !== 8) };
    expect(extractMatchOdds(without365)!.bookmaker).not.toBe('Bet365');
    expect(extractMatchOdds(null)).toBeNull();
    expect(extractMatchOdds({ fixture: { id: 1 }, bookmakers: [] })).toBeNull();
  });
});

import { comboMarketOdds } from './oddsMarkets';
import { COMBO_MARKETS, OPPOSITE } from '@/utils/comboMarkets';

describe('comboMarketOdds — marjı temizlenmiş piyasa olasılığı', () => {
  it('Süper Lig: sekiz pazarın hepsi; iki yön toplamı %100; Bet365 referans oranı', () => {
    const m = comboMarketOdds(sl);
    for (const key of COMBO_MARKETS) {
      expect(m[key], key).toBeDefined();
      expect(m[key]!.marketPct + m[OPPOSITE[key]]!.marketPct).toBeGreaterThan(99);
      expect(m[key]!.marketPct + m[OPPOSITE[key]]!.marketPct).toBeLessThan(101);
    }
    expect(m.over25!.odd).toBe(1.3);
    expect(m.over25!.marketPct).toBeGreaterThan(m.under25!.marketPct);
    // Marj temizlenince olasılık ham 1/oran'dan küçüktür (üst yön).
    expect(m.over25!.marketPct).toBeLessThan(100 / 1.3);
  });

  it('milli maç (1xBet): olmayan çizgi atlanır; veri yok → boş', () => {
    const m = comboMarketOdds(nat);
    expect(m.over25?.bookmakers).toBe(1);
    expect(comboMarketOdds(null)).toEqual({});
  });

  it('tek yön varsa (karşı oran yok) pazar atlanır', () => {
    const one: AfOddsEntry = { fixture: { id: 1 }, bookmakers: [{ id: 8, name: 'Bet365', bets: [{ id: 8, name: 'BTTS', values: [{ value: 'Yes', odd: '1.8' }] }] }] };
    expect(comboMarketOdds(one)).toEqual({});
  });
});
