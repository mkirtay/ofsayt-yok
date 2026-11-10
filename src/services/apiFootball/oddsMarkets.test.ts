import { describe, expect, it } from 'vitest';
import { marketOdd, MARKET_SPECS, type AfOddsEntry } from './oddsMarkets';
import slOdds from './__fixtures__/oddsSuperLig_1584458.json';
import uclOdds from './__fixtures__/oddsUcl_1635726.json';
import natOdds from './__fixtures__/oddsNationalOnly1xBet_1528991.json';
import emptyOdds from './__fixtures__/oddsEmpty_1545657.json';
import type { TopPickKey } from '@/utils/analysisTopPicks';

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
    for (const key of Object.keys(MARKET_SPECS) as TopPickKey[]) {
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
