/**
 * /hakemler tablosu sıralaması. Varsayılan maç sayısı (çoktan aza). Oran sütunlarında (maç başı …) 3 maçtan az hakem
 * yön ne olursa olsun en alta düşer ("az maç"); değeri olmayan (—) onların da altına. Eşitlikte ad.
 */
import type { RefereeSeasonLine } from '@/services/sportmonks/refereeStats';

export const FEW_MATCHES_THRESHOLD = 3;

export type RefereeSortKey = 'matches' | 'yellow' | 'red' | 'penalties' | 'fouls' | 'var';
export type SortDir = 'asc' | 'desc';

type Row = Pick<RefereeSeasonLine, 'matches' | 'yellowPerMatch' | 'redPerMatch' | 'penaltiesPerMatch' | 'foulsPerMatch' | 'varPerMatch'> & { name: string };

const VALUE: Record<Exclude<RefereeSortKey, 'matches'>, (r: Row) => number | null> = {
  yellow: (r) => r.yellowPerMatch,
  red: (r) => r.redPerMatch,
  penalties: (r) => r.penaltiesPerMatch,
  fouls: (r) => r.foulsPerMatch,
  var: (r) => r.varPerMatch,
};

export const isFewMatches = (r: Pick<Row, 'matches'>) => r.matches < FEW_MATCHES_THRESHOLD;

export function sortRefereeRows<T extends Row>(rows: readonly T[], key: RefereeSortKey, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'tr');
  if (key === 'matches') return [...rows].sort((a, b) => sign * (a.matches - b.matches) || byName(a, b));
  const get = VALUE[key];
  const tier = (r: T) => (get(r) == null ? 2 : isFewMatches(r) ? 1 : 0);
  return [...rows].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    const va = get(a);
    const vb = get(b);
    if (va == null || vb == null) return byName(a, b);
    return sign * (va - vb) || byName(a, b);
  });
}
