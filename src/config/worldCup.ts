export const WORLD_CUP_COMPETITION_ID = 362;

/** `seasons/list` içinde "2026" satırının `id` değeri (varsayılan sezon). */
export const WORLD_CUP_DEFAULT_SEASON_ID = 52;

const WORLD_CUP_GROUP_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function groupNameOrder(name?: string): number {
  const idx = WORLD_CUP_GROUP_ORDER.indexOf((name || '').toUpperCase());
  return idx >= 0 ? idx : 999;
}

export function sortWorldCupGroupsByName<T extends { name?: string }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const ao = groupNameOrder(a.name);
    const bo = groupNameOrder(b.name);
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '', 'tr');
  });
}

const WORLD_CUP_SEASON_START_YEAR = 2026;
const WORLD_CUP_SEASON_MIN_YEAR = 1930;

/**
 * Sezon listesinden yalnızca Dünya Kupası yıllarını seçer: 2026, 2022, 2018, … (API'de `name` tam eşleşenler).
 * Sıra: yeniden eskiye.
 */
export function pickWorldCupSeasonsFromApi<T extends { id: number; name: string }>(seasons: T[]): T[] {
  const byName = new Map<string, T>();
  for (const s of seasons) {
    byName.set(s.name.trim(), s);
  }
  const out: T[] = [];
  for (let y = WORLD_CUP_SEASON_START_YEAR; y >= WORLD_CUP_SEASON_MIN_YEAR; y -= 4) {
    const row = byName.get(String(y));
    if (row) out.push(row);
  }
  return out;
}
