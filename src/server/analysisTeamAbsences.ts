/**
 * AI analiz bağlamı için takımın güncel sakat ve cezalı oyuncuları (+ sezondaki katkıları).
 *
 * Takım sayfasıyla AYNI istekler kurulur ki paylaşımlı önbellekten gelsin (bkz. TeamDetailView):
 *   1. `teams/{id}` + TEAM_OVERVIEW_INCLUDE → güncel sezonun turnuva-sezon id'leri (sezon seçicinin ilk elemanı)
 *   2. `teams/{id}` + TEAM_STATS_INCLUDE, filtre = o sezon id'leri → `sidelined` (Sezon Özeti / Sakatlar kartı isteği)
 *   3. `squads/seasons/{s}/teams/{id}` (Kadro sekmesi M/G/A isteği) → ana lig sezonunda maç/gol/asist
 * Takım sayfası yakın zamanda açıldıysa 0, soğuk önbellekte takım başına 3 istek.
 * Hata ya da veri yoksa `null` döner: analiz bu bölümü atlar (eksik veriyi "bilgi yok" diye modele söylemez).
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { getTeamOverview, getTeamSeasonStats } from '@/services/teamPage';
import { defaultCompetitionId, selectableCampaigns, type TeamOverview } from '@/services/sportmonks/teamOverview';
import { mapTeamSidelined, type SidelinedReason } from '@/services/sportmonks/teamSidelined';
import { SQUAD_SEASON_STATS_INCLUDE, squadSeasonStatsFilters } from '@/services/sportmonks/teamScorers';
import { extractSquadStats, type SquadStatLine } from '@/services/sportmonksKatman2Mapper';
import type { SportmonksSquadStatsRow } from '@/services/sportmonks/types';
import { detailedPositionLabel } from '@/utils/positionLabel';

export type AnalysisAbsence = {
  name: string;
  /** Türkçe mevki etiketi (ör. "Stoper"); kadro verisinde yoksa yok. */
  position?: string;
  kind: SidelinedReason['category'];
  /** Sportmonks kayıt türü (ör. "Knee Injury", "Red Card Suspension"). */
  reason: string;
  /** En geç dönüş tarihi (YYYY-MM-DD); açık uçluysa yok. */
  until?: string;
  /** Ana lig sezonunda oynadığı maç / gol / asist (oynamadıysa ya da veri yoksa yok). */
  apps?: number;
  goals?: number;
  assists?: number;
};

export type TeamAbsences = { players: AnalysisAbsence[] };

/** Takım sayfasının sezon seçicisiyle aynı: güncel sezonun turnuva-sezon id'leri + ana lig sezonu. */
export function currentCampaignSeasons(overview: TeamOverview): { seasonIds: number[]; leagueSeasonId: number | null } {
  const primary = defaultCompetitionId(overview.recent, overview.fixtures);
  const current = selectableCampaigns(overview.campaigns, primary)[0];
  const seasons = current?.seasons ?? [];
  const league = seasons.find((s) => s.leagueId === primary) ?? null;
  return { seasonIds: seasons.map((s) => s.id), leagueSeasonId: league?.id ?? null };
}

export function buildAbsences(
  sidelined: ReturnType<typeof mapTeamSidelined>,
  squadStats: Record<number, SquadStatLine>,
): AnalysisAbsence[] {
  return sidelined.players.map((p) => {
    const line = squadStats[p.playerId];
    const position = detailedPositionLabel(line?.detailedPositionId);
    const main = p.reasons[0]!;
    return {
      name: p.name,
      ...(position ? { position } : {}),
      kind: main.category,
      reason: p.reasons.map((r) => r.name).join(' + '),
      ...(p.until ? { until: p.until } : {}),
      ...(line?.appearances
        ? { apps: line.appearances, goals: line.goals ?? 0, assists: line.assists ?? 0 }
        : {}),
    };
  });
}

/** @param todayIso TR günü (YYYY-MM-DD) — bitiş tarihi geçmiş kayıtlar elenir. */
export async function getTeamAbsences(teamId: number, todayIso: string): Promise<TeamAbsences | null> {
  try {
    const overview = await getTeamOverview(String(teamId));
    const { seasonIds, leagueSeasonId } = currentCampaignSeasons(overview);
    if (seasonIds.length === 0) return null;
    const [stats, squad] = await Promise.all([
      getTeamSeasonStats(String(teamId), seasonIds),
      leagueSeasonId != null
        ? sportmonksClientRequest<SportmonksSquadStatsRow[]>('football', `/squads/seasons/${leagueSeasonId}/teams/${teamId}`, {
            include: SQUAD_SEASON_STATS_INCLUDE,
            filters: squadSeasonStatsFilters(leagueSeasonId),
          }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const sidelined = mapTeamSidelined(stats.sidelined, todayIso);
    const squadStats = squad?.data && leagueSeasonId != null ? extractSquadStats(squad.data, leagueSeasonId, teamId) : {};
    return { players: buildAbsences(sidelined, squadStats) };
  } catch {
    return null;
  }
}
