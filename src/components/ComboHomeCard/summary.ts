/** Kombine özeti (saf): seçili maçların olasılığı, (varsa) oranı, başabaş olasılığı ve değer farkı. */
import { breakEvenProbability, comboOdds, comboProbability, valueEdge, type ComboCandidate } from '@/utils/comboPicks';

export type ComboSummary = {
  count: number;
  probability: number;
  odds: number | null;
  /** Oran var ama bazı seçili maçlarda oran yok → eksik sayısı. */
  missingOdds: number;
  breakEven: number | null;
  edge: number | null;
};

export function summarize(picks: readonly ComboCandidate[]): ComboSummary {
  const odds = comboOdds(picks.map((p) => p.odd));
  const probability = comboProbability(picks.map((p) => p.pct));
  return {
    count: picks.length,
    probability,
    odds,
    missingOdds: picks.filter((p) => !(typeof p.odd === 'number' && p.odd > 1)).length,
    breakEven: odds != null ? breakEvenProbability(odds) : null,
    edge: odds != null ? valueEdge(probability, odds) : null,
  };
}
