import { useQuery } from '@tanstack/react-query';
import {
  getSeasonsList,
  getTopDisciplinary,
  type CompetitionTableData,
  type SeasonListItem,
  type TopScorersPayload,
} from '@/services/liveScoreService';
import type { DisciplinaryRow } from '@/services/sportmonksKatman2Mapper';
import { fetchCompetitionStandings } from '@/services/competitionStandings';
import type { TeamOfTheWeek } from '@/services/sportmonks/teamOfTheWeek';
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
      // Hata fırlatır (hata ≠ tablo yok): sayfa "Veri yüklenemedi · Tekrar dene" gösterir, önbelleğe boş yazılmaz.
      return fetchCompetitionStandings(leagueId, { ...(seasonId != null ? { season: seasonId } : {}), withForm: true });
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
      const { fetchTopScorersWithAppearances } = await import('@/services/competitionTopScorers');
      return fetchTopScorersWithAppearances(leagueId, seasonId != null ? { season: seasonId } : undefined);
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

/**
 * Haftanın 11'i (`/api/leagues/{id}/team-of-the-week`, CDN'li). 404 = bu ligde yok → null (sekme hiç görünmez); diğer
 * hatalar fırlatılır (hata ≠ veri yok: sekme açıksa "yüklenemedi · tekrar dene").
 */
export function useStandingsTeamOfTheWeek(selectionId: number, enabled: boolean) {
  return useQuery<TeamOfTheWeek | null>({
    queryKey: ['standings-page', 'totw', selectionId] as const,
    queryFn: async () => {
      const leagueId = standingsLeagueId(selectionId);
      if (leagueId == null) return null;
      const res = await fetch(`/api/leagues/${leagueId}/team-of-the-week`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`team-of-the-week ${res.status}`);
      return (await res.json()) as TeamOfTheWeek;
    },
    enabled,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
}
