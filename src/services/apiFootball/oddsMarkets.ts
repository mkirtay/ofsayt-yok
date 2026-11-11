/**
 * API-Football `odds?fixture=` yanıtından, analizin pazar anahtarlarına (`TopPickKey`) karşılık gelen "yaklaşık piyasa
 * oranı". Kaynak: uluslararası bookmaker'lar (Türk bahis şirketi YOK) — arayüzde iddaa oranı gibi sunulmaz.
 * Bet kimlikleri `odds/bets` kataloğundan; gerçek yanıtlarla test edilir (oddsMarkets.test.ts, __fixtures__/odds*.json).
 */
import type { TopPickKey } from '@/utils/analysisTopPicks';
import { COMBO_MARKETS, OPPOSITE, devigPair, type ComboMarketKey } from '@/utils/comboMarkets';

export type MarketKey = TopPickKey | ComboMarketKey;

export type AfOddsValue = { value: string; odd: string };
export type AfOddsBet = { id: number; name: string; values: AfOddsValue[] };
export type AfOddsBookmaker = { id: number; name: string; bets: AfOddsBet[] };
export type AfOddsEntry = {
  fixture: { id: number; date?: string; timestamp?: number };
  update?: string;
  bookmakers: AfOddsBookmaker[];
};

/** Bir pazarın AF karşılığı: (bet id, değer etiketi). Sıra = öncelik (ilki yoksa sonraki). */
export const MARKET_SPECS: Record<MarketKey, ReadonlyArray<{ betId: number; value: string }>> = {
  home: [{ betId: 1, value: 'Home' }],
  draw: [{ betId: 1, value: 'Draw' }],
  away: [{ betId: 1, value: 'Away' }],
  over15: [{ betId: 5, value: 'Over 1.5' }],
  over25: [{ betId: 5, value: 'Over 2.5' }],
  over35: [{ betId: 5, value: 'Over 3.5' }],
  under15: [{ betId: 5, value: 'Under 1.5' }],
  under25: [{ betId: 5, value: 'Under 2.5' }],
  under35: [{ betId: 5, value: 'Under 3.5' }],
  btts: [{ betId: 8, value: 'Yes' }],
  bttsNo: [{ betId: 8, value: 'No' }],
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
export function marketOdd(entry: AfOddsEntry | null | undefined, key: MarketKey): MarketOdd | null {
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

export type ComboMarketOdds = {
  /** Marjı temizlenmiş piyasa olasılığı (yüzde, bir ondalık): iki yönü de sunan bookmaker'ların medyanı. */
  marketPct: number;
  /** Tercih sırasındaki ilk bookmaker'ın oranı (uluslararası referans; Türk sitesi oranı DEĞİL). */
  odd: number;
  bookmakers: number;
};

/**
 * Kombine pazarlarının (comboMarkets.ts) piyasa olasılığı: her bookmaker'da pazarın iki yönü (üst/alt, var/yok) varsa marj
 * temizlenir, bookmaker'lar arası medyan alınır. İki yönü olmayan pazar atlanır.
 */
export function comboMarketOdds(entry: AfOddsEntry | null | undefined): Partial<Record<ComboMarketKey, ComboMarketOdds>> {
  const out: Partial<Record<ComboMarketKey, ComboMarketOdds>> = {};
  if (!entry) return out;
  const ordered = [...entry.bookmakers].sort((a, b) => {
    const ia = BOOKMAKER_PREFERENCE.indexOf(a.id);
    const ib = BOOKMAKER_PREFERENCE.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const key of COMBO_MARKETS) {
    const spec = MARKET_SPECS[key][0];
    const opp = MARKET_SPECS[OPPOSITE[key]][0];
    const found = ordered.flatMap((bk) => {
      const odd = oddOf(bk, spec);
      const other = oddOf(bk, opp);
      const pct = odd != null && other != null ? devigPair(odd, other) : null;
      return pct == null || odd == null ? [] : [{ odd, pct }];
    });
    if (found.length === 0) continue;
    out[key] = { marketPct: Math.round(median(found.map((f) => f.pct)) * 10) / 10, odd: found[0].odd, bookmakers: found.length };
  }
  return out;
}

export type TotalsRow = { line: number; over: number; under: number };
export type HandicapRow = { line: number; home: number; away: number };

export type MatchOddsView = {
  bookmaker: string;
  updatedAt: string | null;
  /** Maç Sonucu 1 X 2 (bet 1). */
  result?: { home: number; draw: number; away: number };
  /** Çifte Şans 1X / X2 / 12 (bet 12: Home/Draw, Draw/Away, Home/Away). */
  doubleChance?: { homeDraw: number; drawAway: number; homeAway: number };
  /** İlk Yarı Sonucu 1 X 2 (bet 13). */
  firstHalf?: { home: number; draw: number; away: number };
  /** Beraberlikte İade 1 / 2 (bet 2 "Home/Away" = draw no bet). Yalnız Bet365 / William Hill'de var; milli maçta (1xBet) yok. */
  drawNoBet?: { home: number; away: number };
  /** Karşılıklı Gol Var / Yok (bet 8). */
  btts?: { yes: number; no: number };
  /** Toplam Gol: iki yönü de olan TÜM çizgiler (bet 5), küçükten büyüğe. Ana çizgiler (1.5 / 2.5 / 3.5) arayüzde öne alınır. */
  totals: TotalsRow[];
  /** Handikap (Asya, bet 4): çizgi = ev sahibinin handikapı; `home` o çizgideki ev, `away` karşı yön oranı. Dengeli çizgiye yakın 5 satır. */
  handicap: HandicapRow[];
};

export const MAIN_TOTAL_LINES = [1.5, 2.5, 3.5] as const;

function numLine(v: string, prefix: string): number | null {
  if (!v.startsWith(prefix)) return null;
  const n = Number(v.slice(prefix.length).trim());
  return Number.isFinite(n) ? n : null;
}

function allTotals(bk: AfOddsBookmaker): TotalsRow[] {
  const bet = bk.bets.find((b) => b.id === 5);
  if (!bet) return [];
  const rows = new Map<number, Partial<TotalsRow>>();
  for (const v of bet.values) {
    const odd = parseOdd(v.odd);
    if (odd == null) continue;
    const over = numLine(v.value, 'Over ');
    const under = numLine(v.value, 'Under ');
    if (over != null) rows.set(over, { ...rows.get(over), line: over, over: odd });
    if (under != null) rows.set(under, { ...rows.get(under), line: under, under: odd });
  }
  return [...rows.values()].filter((r): r is TotalsRow => r.over != null && r.under != null).sort((a, b) => a.line - b.line);
}

function handicapRows(bk: AfOddsBookmaker): HandicapRow[] {
  const bet = bk.bets.find((b) => b.id === 4);
  if (!bet) return [];
  const rows = new Map<number, Partial<HandicapRow>>();
  for (const v of bet.values) {
    const odd = parseOdd(v.odd);
    if (odd == null) continue;
    const home = numLine(v.value, 'Home ');
    const away = numLine(v.value, 'Away ');
    if (home != null) rows.set(home, { ...rows.get(home), line: home, home: odd });
    if (away != null) rows.set(away, { ...rows.get(away), line: away, away: odd });
  }
  const full = [...rows.values()].filter((r): r is HandicapRow => r.home != null && r.away != null);
  if (full.length === 0) return [];
  // Dengeli çizgi: iki yönün oranı birbirine en yakın olan; çevresinden 5 satır.
  const balanced = [...full].sort((a, b) => Math.abs(a.home - a.away) - Math.abs(b.home - b.away))[0]!;
  return full
    .sort((a, b) => Math.abs(a.line - balanced.line) - Math.abs(b.line - balanced.line) || a.line - b.line)
    .slice(0, 5)
    .sort((a, b) => a.line - b.line);
}

function viewFor(bk: AfOddsBookmaker): Omit<MatchOddsView, 'bookmaker' | 'updatedAt'> {
  const get = (betId: number, value: string): number | null => oddOf(bk, { betId, value });
  const triple = (betId: number) => {
    const h = get(betId, 'Home');
    const d = get(betId, 'Draw');
    const a = get(betId, 'Away');
    return h != null && d != null && a != null ? { home: h, draw: d, away: a } : undefined;
  };
  const dcH = get(12, 'Home/Draw');
  const dcA = get(12, 'Draw/Away');
  const dc12 = get(12, 'Home/Away');
  const dnbH = get(2, 'Home');
  const dnbA = get(2, 'Away');
  const y = get(8, 'Yes');
  const n = get(8, 'No');
  const result = triple(1);
  const firstHalf = triple(13);
  return {
    ...(result ? { result } : {}),
    ...(dcH != null && dcA != null && dc12 != null ? { doubleChance: { homeDraw: dcH, drawAway: dcA, homeAway: dc12 } } : {}),
    ...(firstHalf ? { firstHalf } : {}),
    ...(dnbH != null && dnbA != null ? { drawNoBet: { home: dnbH, away: dnbA } } : {}),
    ...(y != null && n != null ? { btts: { yes: y, no: n } } : {}),
    totals: allTotals(bk),
    handicap: handicapRows(bk),
  };
}

/**
 * Maç detayı "Piyasa oranları" kartı: tercih sırasındaki İLK bookmaker'ın (hepsi aynı bookmaker'dan) pazarları. Olmayan pazar
 * alanı yok → arayüz o bölümü gizler (uydurma yok). Hiçbir pazar yoksa null (kart gizlenir). Milli maçta yalnız 1xBet gelir:
 * Beraberlikte İade yoktur, alt/üst çizgileri 2.0–4.0 aralığındadır, 1.5 çizgisi yoktur.
 */
export function extractMatchOdds(entry: AfOddsEntry | null | undefined): MatchOddsView | null {
  if (!entry) return null;
  const ordered = [...entry.bookmakers].sort((a, b) => {
    const ia = BOOKMAKER_PREFERENCE.indexOf(a.id);
    const ib = BOOKMAKER_PREFERENCE.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const bk of ordered) {
    const v = viewFor(bk);
    if (v.result || v.doubleChance || v.firstHalf || v.drawNoBet || v.btts || v.totals.length > 0 || v.handicap.length > 0) {
      return { bookmaker: bk.name, updatedAt: entry.update ?? null, ...v };
    }
  }
  return null;
}
