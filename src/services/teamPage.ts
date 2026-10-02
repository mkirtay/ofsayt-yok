/**
 * Takım sayfası (/teams/[id] + ana sayfa takım paneli) istemci istekleri. Tarayıcıda `/api/sportmonks` proxy'sine,
 * sunucuda paylaşımlı cache'e gider (bkz. sportmonksRuntimeClient.ts).
 */
import { sportmonksClientRequest } from './sportmonksRuntimeClient';
import {
  mapTeamOverview,
  TEAM_OVERVIEW_INCLUDE,
  type SportmonksTeamOverview,
  type TeamMatch,
  type TeamOverview,
  type TeamSeasonRef,
} from './sportmonks/teamOverview';
import { mapTeamSchedule, mergeSeasonMatches, type SportmonksScheduleStage } from './sportmonks/teamSchedule';
import {
  mapTeamSeasonStats,
  TEAM_STATS_INCLUDE,
  teamStatsFilters,
  type SportmonksTeamWithStatistics,
  type TeamSeasonStats,
} from './sportmonks/teamSeasonStats';
import {
  extractTeamScorers,
  SQUAD_SEASON_STATS_FINISHED_INCLUDE,
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

/**
 * Bir turnuva-sezonda takımın golcü/asistçileri — sürmekte olan sezonda Kadro sekmesinin M/G/A isteğiyle aynı
 * istek (aynı önbellek); bitmiş sezonda `player.statistics.season` eklenir (30 gün önbellek).
 */
export async function getTeamSeasonScorers(teamId: string, seasonId: number, finished = false): Promise<TeamScorer[]> {
  const envelope = await sportmonksClientRequest<SportmonksSquadStatsRow[]>(
    'football',
    `/squads/seasons/${seasonId}/teams/${teamId}`,
    {
      include: finished ? SQUAD_SEASON_STATS_FINISHED_INCLUDE : SQUAD_SEASON_STATS_INCLUDE,
      filters: squadSeasonStatsFilters(seasonId),
    },
  );
  return extractTeamScorers(envelope.data ?? [], seasonId, Number(teamId));
}

/**
 * Geçmiş sezonun tüm maçları (tüm turnuvalar): turnuva-sezon başına bir `schedules/seasons/{s}/teams/{id}` isteği.
 * Bir turnuva gelmezse diğerleri yine gösterilir; hiçbiri gelmezse hata fırlatır.
 */
export async function getTeamSeasonMatches(teamId: string, seasons: TeamSeasonRef[]): Promise<TeamMatch[]> {
  const results = await Promise.allSettled(
    seasons.map(async (season) => {
      const envelope = await sportmonksClientRequest<SportmonksScheduleStage[]>(
        'football',
        `/schedules/seasons/${season.id}/teams/${teamId}`,
      );
      return mapTeamSchedule(envelope.data, season, Number(teamId));
    }),
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<TeamMatch[]> => r.status === 'fulfilled');
  if (ok.length === 0 && results.length > 0) throw (results[0] as PromiseRejectedResult).reason;
  return mergeSeasonMatches(ok.map((r) => r.value));
}
