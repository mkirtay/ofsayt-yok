/**
 * Ana sayfa "Gece maçları" bölümünün lig grupları (bkz. utils/nightMatches.ts) — saf, test edilebilir.
 * Ertesi günün canlı satırları gece maçlarının üstüne yazılır (canlı güncelleme); üst sekme (Canlı/Bitmiş/Favoriler)
 * ve lig filtresi ana listeyle aynı. Ana listede zaten çizilen maç (ör. "Canlı" sekmesi tüm canlıları gösterir)
 * burada tekrar çizilmez.
 */
import type { Match } from '@/models/liveScore';
import type { MatchTab } from '@/components/SubHeader';
import {
  groupMatchesByLeague,
  mergeMatchesByIdForAllTab,
  sortGroupedMatchesForAllTab,
  type GroupedLeagueMatches,
} from '@/services/liveScoreService';
import { filterMatchesByLeagues, type LeagueFilterState } from '@/utils/leagueFilter';
import { isNightMatchOf, nightDateOf } from '@/utils/nightMatches';

export type NightGroupsInput = {
  selectedDate: string;
  nightMatches: Match[];
  liveMatches: Match[];
  activeTab: MatchTab;
  favoriteTeamIds: ReadonlySet<number>;
  /** Ana listede çizilen maçların id'leri. */
  shownIds: ReadonlySet<number>;
  /** Sayfanın lig kısıtı (`allowedCompetitionIds`); null = yok. */
  competitionFilter: ReadonlySet<number> | null;
  leagueFilter: LeagueFilterState;
};

export function buildNightGroups(input: NightGroupsInput): GroupedLeagueMatches[] {
  const { selectedDate, nightMatches, liveMatches, activeTab, favoriteTeamIds, shownIds, competitionFilter, leagueFilter } = input;
  if (nightMatches.length === 0) return [];
  const merged = mergeMatchesByIdForAllTab({
    selectedDate: nightDateOf(selectedDate),
    historyPageMatches: [],
    liveMatches,
    fixtures: nightMatches,
  });
  const byTab = merged.filter((m) => {
    if (shownIds.has(Number(m.id)) || !isNightMatchOf(m, selectedDate)) return false;
    switch (activeTab) {
      case 'live':
        return m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK';
      case 'finished':
        return m.status === 'FINISHED';
      case 'favorites':
        return favoriteTeamIds.has(m.home?.id ?? -1) || favoriteTeamIds.has(m.away?.id ?? -1);
      default:
        return true;
    }
  });
  const allowed = competitionFilter ? byTab.filter((m) => competitionFilter.has(m.competition?.id ?? 0)) : byTab;
  const raw = groupMatchesByLeague(filterMatchesByLeagues(allowed, leagueFilter));
  return activeTab === 'all' ? sortGroupedMatchesForAllTab(raw) : raw;
}
