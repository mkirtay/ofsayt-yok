/**
 * Maç sonucu okuma yardımcıları (domain `Match`): bitti mi, normal süre skoru, devre skoru. AI tahmin değerlendirmesi
 * (lib/predictionRecords.ts) ve tahmin oyunu (server/game/settle.ts) aynı kuralları kullanır.
 *
 * `scores.ft_score` Sportmonks `2ND_HALF` skorlarından türetilir (services/sportmonks/scoreDerivation.ts) → NORMAL SÜRE
 * (uzatma devreleri ve penaltılar hariç); yoksa düz skora düşülür.
 */
import type { Match } from '@/models/liveScore';

export function parseScoreGoals(raw?: string | null): [number, number] | null {
  if (!raw) return null;
  const m = /(\d+)\s*[-:]\s*(\d+)/.exec(String(raw));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

export function isMatchFinished(match: Match | null): boolean {
  if (!match) return false;
  const s = String(match.status ?? '').toUpperCase();
  return s === 'FINISHED' || s === 'FT' || s === 'FULL TIME' || s === 'ENDED';
}

/** Normal süre skoru "E-D"; okunamazsa null. */
export function extractFinalScore(match: Match): string | null {
  const raw = match.scores?.ft_score || match.scores?.score || match.score;
  const goals = parseScoreGoals(raw);
  if (!goals) return null;
  return `${goals[0]}-${goals[1]}`;
}

export function extractHtScore(match: Match): [number, number] | null {
  return parseScoreGoals(match.scores?.ht_score);
}
