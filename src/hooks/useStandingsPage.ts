import { useQuery } from '@tanstack/react-query';
import {
  getSeasonsList,
  getTopDisciplinary,
  type CompetitionTableData,
  type SeasonListItem,
  type TopScorersPayload,
} from '@/services/liveScoreService';
import type { DisciplinaryRow } from '@/services/sportmonksKatman2Mapper';
import { getCompetitionStandings } from '@/services/competitionStandings';
import { sportmonksLeagueIdOfHubSelection } from '@/utils/hubLeagueSelection';

/**
 * /standings sayfası: lig = ana sayfa yan panelindeki seçim id'si (legacy id ya da negatif Sportmonks id; bkz.
 * utils/hubLeagueSelection.ts), sezon = o ligin sezon listesinden. Üç sekme AYRI sorgudur ve yalnız açıkken çekilir
 * (eskiden üçü birden her açılışta çekiliyordu). Önbellek süreleri eskisiyle aynı (60 sn / 5 dk).
 */
const STALE_MS = 60_000;
const GC_MS = 5 * 60_000;

function standingsLeagueId(selectionId: number): string | null {
  const id = sportmonksLeagueIdOfHubSelection(selectionId);
  return id == null ? null : String(id);
}

/** Sezon listesi: ana sayfa yan paneliyle aynı kaynak (`leagues/{id}?include=seasons` tarayıcıda paylaşılır). */
export function useStandingsSeasons(selectionId: number, enabled = true) {
  return useQuery<SeasonListItem[]>({
    queryKey: ['standings-seasons', selectionId] as const,
    queryFn: async () => {
      const leagueId = standingsLeagueId(selectionId);
      return leagueId == null ? [] : getSeasonsList({ competitionId: leagueId });
    },
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });
}

/** Puan tablosu (+ son 5 maç formu). `seasonId` null → güncel sezon; dönen `season.id` seçili sezonu bildirir. */
export function useStandingsTable(selectionId: number, seasonId: number | null, enabled = true) {
  return useQuery<CompetitionTableData | null>({
    queryKey: ['standings-page', 'table', selectionId, seasonId ?? 'current'] as const,
    queryFn: async () => {
      const leagueId = standingsLeagueId(selectionId);
      if (leagueId == null) return null;
      return getCompetitionStandings(leagueId, { ...(seasonId != null ? { season: seasonId } : {}), withForm: true });
    },
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}

export function useStandingsScorers(selectionId: number, seasonId: number | null, enabled: boolean) {
  return useQuery<TopScorersPayload | null>({
    queryKey: ['standings-page', 'scorers', selectionId, seasonId ?? 'current'] as const,
    queryFn: async () => {
      const leagueId = standingsLeagueId(selectionId);
      if (leagueId == null) return null;
      // Ana sayfa Gol Krallığı sekmesiyle aynı çağrı: oynanan maç (O) yanıta gömülü, ek istek yok. Yalnız sekme açılınca yüklenir.
      const { getTopScorersWithAppearances } = await import('@/services/competitionTopScorers');
      return getTopScorersWithAppearances(leagueId, seasonId != null ? { season: seasonId } : undefined);
    },
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}

export function useStandingsCards(selectionId: number, seasonId: number | null, enabled: boolean) {
  return useQuery<DisciplinaryRow[]>({
    queryKey: ['standings-page', 'cards', selectionId, seasonId ?? 'current'] as const,
    queryFn: async () => {
      const leagueId = standingsLeagueId(selectionId);
      return leagueId == null ? [] : getTopDisciplinary(leagueId, seasonId != null ? { season: seasonId } : undefined);
    },
    enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
  });
}
