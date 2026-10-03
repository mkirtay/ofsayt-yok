import type { Match } from '@/models/liveScore';

/**
 * Bitmiş maçın kısa etiketi için çeviri anahtarı: normal bitiş "MS" (`fullTime`), uzatmalar sonucu "UZS"
 * (`afterExtraTime`), penaltılarla bitiş "PEN" (`afterPenalties`). Maç kartı rozeti ve maç listesi satırı ortak.
 */
export function finishedLabelKey(match: Pick<Match, 'finish'>): 'fullTime' | 'afterExtraTime' | 'afterPenalties' {
  if (match.finish === 'PEN') return 'afterPenalties';
  if (match.finish === 'AET') return 'afterExtraTime';
  return 'fullTime';
}
