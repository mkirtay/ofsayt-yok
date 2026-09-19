import { UNKNOWN_POSITION_FALLBACK } from '@/utils/lineupFormation';
import { POSITION_LABEL_TR } from '@/utils/positionLabel';

export type SquadPositionKey = 'GK' | 'DF' | 'MF' | 'FW';
// Görüntüleme sırası: Forvet → Orta Saha → Defans → Kaleci.
const ORDER: SquadPositionKey[] = ['FW', 'MF', 'DF', 'GK'];

export type SquadGroup<T> = { key: SquadPositionKey; label: string; players: T[] };

function shirt(p: { shirt_number?: unknown }): number {
  const n = Number(p.shirt_number);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

/**
 * Kadroyu Forvet → Orta Saha → Defans → Kaleci sırasında gruplar; grup içi forma numarasına göre artan
 * (numarasız en sona). Pozisyonu bilinmeyen oyuncu İlk 11 ile aynı `UNKNOWN_POSITION_FALLBACK` hattına düşer.
 */
export function groupSquadByPosition<T extends { position?: unknown; shirt_number?: unknown }>(
  players: T[],
): SquadGroup<T>[] {
  const buckets: Record<SquadPositionKey, T[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of players) {
    const key = ORDER.includes(p.position as SquadPositionKey) ? (p.position as SquadPositionKey) : UNKNOWN_POSITION_FALLBACK;
    buckets[key].push(p);
  }
  return ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
    key: k,
    label: POSITION_LABEL_TR[k],
    players: [...buckets[k]].sort((a, b) => shirt(a) - shirt(b)),
  }));
}
