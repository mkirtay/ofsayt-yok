import type { MatchOdds } from '@/models/liveScore';

export type ResultProbabilities = { home: number; draw: number; away: number };

/**
 * Maç sonucu oranlarından piyasa beklentisi (yüzde, toplam 100). Oran sayıları arayüzde gösterilmez (AdSense kumar
 * politikası); yalnız olasılık. 1/oran payı normalize edilir (bahis şirketi marjı düşer), yuvarlama en büyük kalanla
 * → toplam her zaman 100. Üç oranın biri eksik / geçersizse (≤ 1) null: şerit çizilmez.
 */
export function impliedProbabilities(odds: MatchOdds['pre'] | null | undefined): ResultProbabilities | null {
  if (!odds) return null;
  const raw = [odds['1'], odds['X'], odds['2']].map(Number);
  if (raw.some((o) => !Number.isFinite(o) || o <= 1)) return null;
  const inv = raw.map((o) => 1 / o);
  const sum = inv.reduce((a, b) => a + b, 0);
  const exact = inv.map((v) => (v / sum) * 100);
  const floored = exact.map(Math.floor);
  let left = 100 - floored.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, rem: v - floored[i] })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floored[i] += 1;
    left -= 1;
  }
  return { home: floored[0], draw: floored[1], away: floored[2] };
}
