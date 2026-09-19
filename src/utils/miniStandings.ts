import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';

/** Düz tablo (`table`) ya da ilk grup/aşamanın satırları — boşsa []. Sağ sütun mini widget'ı için ilk `limit` satır. */
export function pickMiniStandingsRows(
  data: CompetitionTableData | null | undefined,
  limit = 8,
): CompetitionTableStandingRow[] {
  if (!data) return [];
  let rows: CompetitionTableStandingRow[] = [];
  if (Array.isArray(data.table) && data.table.length) {
    rows = data.table;
  } else {
    for (const st of data.stages ?? []) {
      const g = st.groups?.find((grp) => grp.standings?.length);
      if (g?.standings?.length) {
        rows = g.standings;
        break;
      }
    }
  }
  return [...rows].sort((a, b) => a.rank - b.rank).slice(0, Math.max(0, limit));
}
