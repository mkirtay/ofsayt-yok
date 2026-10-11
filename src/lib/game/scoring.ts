/**
 * Tahmin oyunu puanlaması (saf; sürüm 1). Kurallar metni (çeviri `game.rules.*`) ve plan §3.4 ile birebir:
 *
 * | Kriter       | Koşul                                                         | Puan |
 * | Doğru yön    | 1 / X / 2 doğru (beraberlik dahil)                             | 3    |
 * | Gol farkı    | yön doğru VE fark doğru (her beraberlik fark 0)                | +1   |
 * | Toplam gol   | toplam gol doğru (yönden bağımsız)                             | +1   |
 * | Tam skor     | birebir                                                        | +3   |
 * | Nadir skor   | tam skor VE o skoru tahmin edenlerin payı ≤ %5 (≥ 30 tahmin)    | +2   |
 * | Joker        | haftada 1 maç, maç toplamı ×2                                  | ×2   |
 *
 * Maç başı en çok 10, jokerle 20. Sürüm değişirse eski haftalar `GameWeek.scoringVersion` ile eski kuralda kalır.
 */
export const SCORING_VERSION = 1;

export const POINTS = { direction: 3, difference: 1, totalGoals: 1, exact: 3, rare: 2 } as const;
export const RARE_MAX_SHARE = 0.05;
export const RARE_MIN_PREDICTIONS = 30;
export const MAX_GOALS = 15;

export type Score = { home: number; away: number };
export type Breakdown = { dir: number; diff: number; total: number; exact: number; rare: number; joker: boolean };
export type Scored = { points: number; breakdown: Breakdown };

/** Skor dağılımı: { "2-1": 14, …, _total: 82 }. */
export type Distribution = Record<string, number> & { _total: number };

export const scoreKey = (s: Score) => `${s.home}-${s.away}`;

const sign = (s: Score) => Math.sign(s.home - s.away);

export function isValidGoals(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_GOALS;
}

/** Bu skor nadir mi (dağılıma göre)? Toplam eşik altındaysa hiçbir skor nadir değildir. */
export function isRareScore(actual: Score, dist: Distribution | null): boolean {
  if (!dist || dist._total < RARE_MIN_PREDICTIONS) return false;
  return (dist[scoreKey(actual)] ?? 0) / dist._total <= RARE_MAX_SHARE;
}

export function scorePrediction(pred: Score, actual: Score, opts: { rare: boolean; joker: boolean }): Scored {
  const dirOk = sign(pred) === sign(actual);
  const exactOk = pred.home === actual.home && pred.away === actual.away;
  const b: Breakdown = {
    dir: dirOk ? POINTS.direction : 0,
    diff: dirOk && pred.home - pred.away === actual.home - actual.away ? POINTS.difference : 0,
    total: pred.home + pred.away === actual.home + actual.away ? POINTS.totalGoals : 0,
    exact: exactOk ? POINTS.exact : 0,
    rare: exactOk && opts.rare ? POINTS.rare : 0,
    joker: opts.joker,
  };
  const base = b.dir + b.diff + b.total + b.exact + b.rare;
  return { points: opts.joker ? base * 2 : base, breakdown: b };
}

/** Dağılım: tahminlerden (yalnız sayılması gerekenler — çağıran süzer). */
export function buildDistribution(preds: readonly Score[]): Distribution {
  const d: Distribution = { _total: 0 };
  for (const p of preds) {
    const k = scoreKey(p);
    d[k] = (d[k] ?? 0) + 1;
    d._total += 1;
  }
  return d;
}

/** 1 / X / 2 yüzdeleri (tam sayı, toplam ≈ 100). */
export function outcomeShares(dist: Distribution): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (const [k, n] of Object.entries(dist)) {
    if (k === '_total') continue;
    const [h, a] = k.split('-').map(Number);
    if (h! > a!) home += n;
    else if (h! < a!) away += n;
    else draw += n;
  }
  const t = dist._total || 1;
  return { home: Math.round((home / t) * 100), draw: Math.round((draw / t) * 100), away: Math.round((away / t) * 100) };
}
