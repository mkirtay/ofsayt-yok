import type { Match } from '@/models/liveScore';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';
import { dedupeMatchesById, type GroupedLeagueMatches } from '@/services/liveScoreService';
import { sortMatchesForUefaList } from '@/utils/uefaBracket';
import { filterMatchesBySeasonYear } from '@/utils/worldCupBracket';

function kickoffSortKey(m: Match): string {
  return `${(m.date ?? '').trim()} ${(m.scheduled ?? m.time ?? '').trim()} ${m.id ?? ''}`;
}

function isLiveStatus(m: Match): boolean {
  const s = (m.status ?? '').toUpperCase();
  return s === 'IN PLAY' || s === 'HALF TIME BREAK';
}

/** LiveScore canlı endpoint'i bazen `date` döndürmez — `added` veya bugünden türet. */
export function enrichWorldCupLiveMatchDate(m: Match): Match {
  if (m.date?.trim()) return m;
  const added = (m as Match & { added?: string }).added?.trim();
  if (added && added.length >= 10) {
    return { ...m, date: added.slice(0, 10) };
  }
  return { ...m, date: new Date().toISOString().slice(0, 10) };
}

/** Sezon filtresi + tarihsiz canlı WC maçları (mevcut sezon). */
export function filterWorldCupSeasonMatches(matches: Match[], seasonYear: number): Match[] {
  return matches.filter((m) => {
    const y = matchSeasonYearFromMatch(m);
    if (y === seasonYear) return true;
    if (
      y == null &&
      isLiveStatus(m) &&
      m.competition?.id === WORLD_CUP_COMPETITION_ID
    ) {
      return seasonYear >= new Date().getFullYear() - 1;
    }
    return false;
  });
}

function matchSeasonYearFromMatch(m: Match): number | null {
  const d = m.date?.trim();
  if (!d || d.length < 4) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) && y >= 1930 ? y : null;
}

export function isWorldCupLiveOrFinished(m: Match): boolean {
  const s = (m.status ?? '').toUpperCase();
  return s === 'IN PLAY' || s === 'HALF TIME BREAK' || s === 'FINISHED';
}

/** History + canlı WC maçlarını tekilleştirir (canlı satır öncelikli). */
export function mergeWorldCupHistoryAndLive(history: Match[], live: Match[]): Match[] {
  const wcLive = live
    .filter((m) => m.competition?.id === WORLD_CUP_COMPETITION_ID)
    .map(enrichWorldCupLiveMatchDate);
  const map = new Map<number, Match>();
  for (const m of history) {
    const id = Number(m.id);
    if (Number.isFinite(id)) map.set(id, m);
  }
  for (const m of wcLive) {
    const id = Number(m.id);
    if (!Number.isFinite(id)) continue;
    const prev = map.get(id);
    map.set(
      id,
      prev
        ? {
            ...prev,
            ...m,
            date: m.date ?? prev.date,
            scheduled: m.scheduled ?? prev.scheduled,
            scores: m.scores ?? prev.scores,
            status: m.status ?? prev.status,
          }
        : m,
    );
  }
  return dedupeMatchesById(Array.from(map.values()));
}

/** Maçlar sekmesi: seçili sezon, yalnızca canlı + bitmiş, mevcuttan geçmişe. */
export function buildWorldCupLiveFinishedList(
  matches: Match[],
  seasonYear: number,
): Match[] {
  const season = filterWorldCupSeasonMatches(matches, seasonYear);
  return sortMatchesForUefaList(season.filter(isWorldCupLiveOrFinished));
}

/** Takım drawer vb. için grup bazlı liste (fikstür API'si boş olsa da history'den). */
export function buildWorldCupGroupMatches(
  groups: Array<{ id: number; name: string }>,
  history: Match[],
  live: Match[],
  seasonYear: number,
): GroupedLeagueMatches[] {
  const merged = mergeWorldCupHistoryAndLive(
    filterMatchesBySeasonYear(history, seasonYear),
    live,
  );

  return groups
    .map((group) => {
      const nameKey = group.name.trim().toUpperCase();
      const matches = merged
        .filter(
          (m) =>
            m.group_id === group.id ||
            (m.group_name ?? '').trim().toUpperCase() === nameKey,
        )
        .sort((a, b) => kickoffSortKey(a).localeCompare(kickoffSortKey(b)));
      return {
        competition_id: group.id,
        competition_name: `Group ${group.name}`,
        matches,
      };
    })
    .filter((g) => g.matches.length > 0);
}
