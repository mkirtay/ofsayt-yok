import type { LineupPlayer } from '@/models/domain';

export type FormationLayout = {
  /** Kaleciden (index 0) ileri hatta doğru sıralı satırlar. */
  rows: LineupPlayer[][];
  /** "4-2-3-1" gibi; kaleci satırı hariç. */
  label: string | null;
  source: 'grid' | 'position';
};

type PositionKey = 'GK' | 'DF' | 'MF' | 'FW';
const POSITION_ORDER: PositionKey[] = ['GK', 'DF', 'MF', 'FW'];
/** Pozisyonu bilinmeyen/eksik oyuncu için varsayılan hat — sessizce kaybolmasın, orta sahaya konur. */
export const UNKNOWN_POSITION_FALLBACK: PositionKey = 'MF';

function label(rows: LineupPlayer[][]): string | null {
  const outfield = rows.length > 1 && rows[0].length === 1 ? rows.slice(1) : rows;
  const counts = outfield.map((r) => r.length).filter((n) => n > 0);
  return counts.length ? counts.join('-') : null;
}

/**
 * Sportmonks `formation_field` ("satır:sütun") HER ilk-11 oyuncusunda varsa tam
 * formasyon ızgarası kullanılır (4-2-3-1 gibi, `position_id`'nin verdiği kaba
 * GK/DF/MF/FW'den daha hassas). Tek bir oyuncuda bile eksikse karışık bir
 * yerleşim üretmemek için tamamen `position` gruplamasına düşülür; pozisyonu da
 * bilinmeyen oyuncu `UNKNOWN_POSITION_FALLBACK` hattına eklenir.
 */
export function buildFormationLayout(starters: LineupPlayer[]): FormationLayout {
  const gridComplete =
    starters.length > 0 && starters.every((p) => p.formation_row != null && p.formation_col != null);

  if (gridComplete) {
    const byRow = new Map<number, LineupPlayer[]>();
    for (const p of starters) byRow.set(p.formation_row!, [...(byRow.get(p.formation_row!) ?? []), p]);
    const rows = [...byRow.keys()]
      .sort((a, b) => a - b)
      .map((r) => byRow.get(r)!.sort((a, b) => a.formation_col! - b.formation_col!));
    return { rows, label: label(rows), source: 'grid' };
  }

  const groups: Record<PositionKey, LineupPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of starters) {
    const key = POSITION_ORDER.includes(p.position as PositionKey) ? (p.position as PositionKey) : UNKNOWN_POSITION_FALLBACK;
    groups[key].push(p);
  }
  const rows = POSITION_ORDER.map((k) =>
    groups[k].sort((a, b) => Number(a.shirt_number) - Number(b.shirt_number)),
  ).filter((r) => r.length > 0);
  return { rows, label: label(rows), source: 'position' };
}
