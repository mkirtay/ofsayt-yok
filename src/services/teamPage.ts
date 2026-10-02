/**
 * Takım sayfası (/teams/[id] + ana sayfa takım paneli) istemci istekleri. Tarayıcıda `/api/sportmonks` proxy'sine,
 * sunucuda paylaşımlı cache'e gider (bkz. sportmonksRuntimeClient.ts).
 */
import { sportmonksClientRequest } from './sportmonksRuntimeClient';
import {
  mapTeamOverview,
  TEAM_OVERVIEW_INCLUDE,
  type SportmonksTeamOverview,
  type TeamOverview,
} from './sportmonks/teamOverview';
import {
  mapTeamSeasonStats,
  TEAM_STATS_INCLUDE,
  teamStatsFilters,
  type SportmonksTeamWithStatistics,
  type TeamSeasonStats,
} from './sportmonks/teamSeasonStats';
import {
  extractTeamScorers,
  SQUAD_SEASON_STATS_INCLUDE,
  squadSeasonStatsFilters,
  type TeamScorer,
} from './sportmonks/teamScorers';
import type { SportmonksSquadStatsRow } from './sportmonks/types';

/** Son Maçlar + Fikstür + başlık (form, sıradaki maç) — tek `teams/{id}` isteği. Hata fırlatır (react-query yeniden dener). */
export async function getTeamOverview(teamId: string): Promise<TeamOverview> {
  const envelope = await sportmonksClientRequest<SportmonksTeamOverview>('football', `/teams/${teamId}`, {
    include: TEAM_OVERVIEW_INCLUDE,
  });
  return mapTeamOverview(envelope.data);
}

/** Turnuva-sezon istatistikleri (Sezon Özeti; Faz 3: dakika grafiği) — tek `teams/{id}` isteği, sezonlar filtrede. */
export async function getTeamSeasonStats(teamId: string, seasonIds: number[]): Promise<TeamSeasonStats[]> {
  const envelope = await sportmonksClientRequest<SportmonksTeamWithStatistics>('football', `/teams/${teamId}`, {
    include: TEAM_STATS_INCLUDE,
    filters: teamStatsFilters(seasonIds),
  });
  return mapTeamSeasonStats(envelope.data);
}

/** Bir turnuva-sezonda takımın golcü/asistçileri — Kadro sekmesinin M/G/A isteğiyle aynı istek (aynı önbellek). */
export async function getTeamSeasonScorers(teamId: string, seasonId: number): Promise<TeamScorer[]> {
  const envelope = await sportmonksClientRequest<SportmonksSquadStatsRow[]>(
    'football',
    `/squads/seasons/${seasonId}/teams/${teamId}`,
    { include: SQUAD_SEASON_STATS_INCLUDE, filters: squadSeasonStatsFilters(seasonId) },
  );
  return extractTeamScorers(envelope.data ?? [], seasonId, Number(teamId));
}
