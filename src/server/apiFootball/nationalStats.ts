/**
 * Milli takım sayfası ek bölümleri: takım sezon istatistiği (`teams/statistics`) ve turnuva gol / asist krallığı
 * (`players/topscorers` + `topassists`). Hepsi SWR önbellekli (12 sa) ve `apiFootballGet` üzerinden iç bütçe sayacına işler;
 * takım sayfası açılışında en çok 1 + 2 istek (önbellek soğukken). Turnuva / sezon takım verisinden türetilir (sabit yok).
 */
import { nationalLeagueByAfId } from '@/config/nationalLeagues';
import type { TopScorersPayload } from '@/services/liveScoreService';
import type { TeamSeasonStats } from '@/services/sportmonks/teamSeasonStats';
import { toAfId } from '@/services/apiFootball/ids';
import { mapTeamStatistics, mapTopScorers, type AfTeamStatistics } from '@/services/apiFootball/statsMapper';
import { apiFootballGet } from './client';
import { afCached } from './cache';

const TTL_SECONDS = 12 * 60 * 60;

export type NationalStatsResult<T> = { kind: 'found'; data: T } | { kind: 'missing' } | { kind: 'error' };

function validSeason(season: number): boolean {
  return Number.isInteger(season) && season >= 2000 && season <= 2100;
}

export async function loadNationalTeamStats(appTeamId: string, appLeagueId: string, season: number, get: typeof apiFootballGet = apiFootballGet): Promise<NationalStatsResult<TeamSeasonStats>> {
  const team = toAfId(appTeamId);
  const league = toAfId(appLeagueId);
  if (team == null || league == null || !nationalLeagueByAfId(league) || !validSeason(season)) return { kind: 'missing' };
  const r = await afCached<TeamSeasonStats | null>(`tstats:${team}:${league}:${season}`, TTL_SECONDS, async () => {
    // `teams/statistics` yanıtı dizi değil nesne; `AfEnvelope` tipini gevşetiyoruz.
    const body = (await get<unknown>('/teams/statistics', { league, season, team })) as unknown as { response?: AfTeamStatistics };
    return mapTeamStatistics(body.response);
  });
  if (!r.ok) return { kind: 'error' };
  return r.value ? { kind: 'found', data: r.value } : { kind: 'missing' };
}

type Rows = Parameters<typeof mapTopScorers>[0];

export async function loadNationalScorers(appLeagueId: string, season: number, get: typeof apiFootballGet = apiFootballGet): Promise<NationalStatsResult<TopScorersPayload>> {
  const league = toAfId(appLeagueId);
  const meta = league != null ? nationalLeagueByAfId(league) : undefined;
  if (league == null || !meta || !validSeason(season)) return { kind: 'missing' };
  const r = await afCached<TopScorersPayload | null>(`scorers:${league}:${season}`, TTL_SECONDS, async () => {
    const [goals, assists] = await Promise.all([
      get<Rows[number]>('/players/topscorers', { league, season }),
      // Asist listesi tamamlayıcı: o istek düşerse gol listesi yine gösterilir.
      get<Rows[number]>('/players/topassists', { league, season }).catch(() => null),
    ]);
    return mapTopScorers(goals.response ?? [], assists?.response ?? [], meta.name, Number(appLeagueId), season);
  });
  if (!r.ok) return { kind: 'error' };
  return r.value ? { kind: 'found', data: r.value } : { kind: 'missing' };
}
