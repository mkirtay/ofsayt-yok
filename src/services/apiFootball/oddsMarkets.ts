/**
 * API-Football `odds?fixture=` yanıtından, analizin pazar anahtarlarına (`TopPickKey`) karşılık gelen "yaklaşık piyasa
 * oranı". Kaynak: uluslararası bookmaker'lar (Türk bahis şirketi YOK) — arayüzde iddaa oranı gibi sunulmaz.
 * Bet kimlikleri `odds/bets` kataloğundan; gerçek yanıtlarla test edilir (oddsMarkets.test.ts, __fixtures__/odds*.json).
 */
import type { TopPickKey } from '@/utils/analysisTopPicks';

export type AfOddsValue = { value: string; odd: string };
export type AfOddsBet = { id: number; name: string; values: AfOddsValue[] };
export type AfOddsBookmaker = { id: number; name: string; bets: AfOddsBet[] };
export type AfOddsEntry = {
  fixture: { id: number; date?: string; timestamp?: number };
  update?: string;
  bookmakers: AfOddsBookmaker[];
};

/** Bir pazarın AF karşılığı: (bet id, değer etiketi). Sıra = öncelik (ilki yoksa sonraki). */
export const MARKET_SPECS: Record<TopPickKey, ReadonlyArray<{ betId: number; value: string }>> = {
  home: [{ betId: 1, value: 'Home' }],
  draw: [{ betId: 1, value: 'Draw' }],
  away: [{ betId: 1, value: 'Away' }],
  over15: [{ betId: 5, value: 'Over 1.5' }],
  over25: [{ betId: 5, value: 'Over 2.5' }],
  over35: [{ betId: 5, value: 'Over 3.5' }],
  btts: [{ betId: 8, value: 'Yes' }],
  htOver05: [{ betId: 6, value: 'Over 0.5' }],
  htOver15: [{ betId: 6, value: 'Over 1.5' }],
  // Ev sahibi gol bulur: "Total - Home Over 0.5"; yoksa "Clean Sheet - Away: No" (deplasman gol yememedi ⇔ ev gol attı).
  homeToScore: [
    { betId: 16, value: 'Over 0.5' },
    { betId: 28, value: 'No' },
  ],
  awayToScore: [
    { betId: 17, value: 'Over 0.5' },
    { betId: 27, value: 'No' },
  ],
  bttsFirstHalf: [{ betId: 34, value: 'Yes' }],
};

/** Bookmaker tercih sırası (id): Bet365, Pinnacle, Marathonbet, 1xBet, Betano, Betfair, William Hill, BetVictor. */
export const BOOKMAKER_PREFERENCE: readonly number[] = [8, 4, 2, 11, 32, 3, 7, 36];

export type MarketOdd = {
  /** Tercih sırasındaki ilk bookmaker'ın oranı. */
  odd: number;
  bookmaker: string;
  /** Bu pazarı sunan tüm bookmaker'ların medyanı (aykırı oranlara karşı kontrol) ve sayısı. */
  median: number;
  bookmakers: number;
};

function parseOdd(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? n : null;
}

function oddOf(bk: AfOddsBookmaker, spec: { betId: number; value: string }): number | null {
  const bet = bk.bets.find((b) => b.id === spec.betId);
  const v = bet?.values.find((x) => x.value === spec.value);
  return parseOdd(v?.odd);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Pazarın oranı; hiçbir bookmaker sunmuyorsa null. İlk spec (asıl pazar) bulunursa yedek spec'e bakılmaz. */
export function marketOdd(entry: AfOddsEntry | null | undefined, key: TopPickKey): MarketOdd | null {
  if (!entry) return null;
  const ordered = [...entry.bookmakers].sort((a, b) => {
    const ia = BOOKMAKER_PREFERENCE.indexOf(a.id);
    const ib = BOOKMAKER_PREFERENCE.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const spec of MARKET_SPECS[key]) {
    const found = ordered.flatMap((bk) => {
      const odd = oddOf(bk, spec);
      return odd == null ? [] : [{ bk, odd }];
    });
    if (found.length === 0) continue;
    return { odd: found[0].odd, bookmaker: found[0].bk.name, median: median(found.map((f) => f.odd)), bookmakers: found.length };
  }
  return null;
}
