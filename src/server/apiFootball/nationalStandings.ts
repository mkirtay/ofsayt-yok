/** Milli turnuva puan durumu (sade): AF `standings?league&season` → `CompetitionTableData`. Grup başlıkları AF'den. */
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import { nationalLeagueByAfId } from '@/config/nationalLeagues';
import { nationalTeamNameTr } from '@/config/nationalTeamNames';
import { toAfId, toAppId } from '@/services/apiFootball/ids';
import { apiFootballGet } from './client';
import { afCached } from './cache';

type AfStandingRow = {
  rank: number;
  team: { id: number; name: string; logo?: string | null };
  points: number;
  goalsDiff: number;
  group?: string;
  form?: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
};
type AfStandingsResponse = { league: { id: number; name: string; season: number; standings: AfStandingRow[][] } };

export function mapStandingRow(r: AfStandingRow): CompetitionTableStandingRow {
  const form = (r.form ?? '').split('').filter((c): c is 'W' | 'D' | 'L' => c === 'W' || c === 'D' || c === 'L');
  return {
    rank: r.rank,
    points: r.points,
    matches: r.all.played,
    goal_diff: r.goalsDiff,
    goals_scored: r.all.goals.for,
    goals_conceded: r.all.goals.against,
    won: r.all.win,
    drawn: r.all.draw,
    lost: r.all.lose,
    team: { id: toAppId(r.team.id), name: nationalTeamNameTr(r.team.name), ...(r.team.logo ? { logo: r.team.logo } : {}) },
    team_id: toAppId(r.team.id),
    name: nationalTeamNameTr(r.team.name),
    ...(r.team.logo ? { logo: r.team.logo } : {}),
    ...(form.length ? { form } : {}),
  };
}

export function mapStandings(res: AfStandingsResponse): CompetitionTableData | null {
  const groups = res.league.standings.filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  const rows = groups.map((g) => g.map(mapStandingRow));
  const name = nationalLeagueByAfId(res.league.id)?.name ?? res.league.name;
  return {
    competition: { id: toAppId(res.league.id), name },
    season: { name: String(res.league.season) },
    ...(rows.length === 1
      ? { table: rows[0] }
      : { stages: [{ groups: groups.map((g, i) => ({ id: i + 1, name: g[0]?.group ?? `Grup ${i + 1}`, standings: rows[i] })) }] }),
  };
}

export type NationalStandingsResult = { kind: 'found'; data: CompetitionTableData } | { kind: 'missing' } | { kind: 'error' };

/** `appLeagueId` kaydırılmış lig id'si (maçın `competition.id`'si). */
export async function loadNationalStandings(appLeagueId: string, get: typeof apiFootballGet = apiFootballGet): Promise<NationalStandingsResult> {
  const afLeague = toAfId(appLeagueId);
  if (afLeague == null || !nationalLeagueByAfId(afLeague)) return { kind: 'missing' };
  const r = await afCached<CompetitionTableData | null>(`standings:${afLeague}`, 600, async () => {
    const seasons = await get<{ seasons: Array<{ year: number; current: boolean }> }>('/leagues', { id: afLeague, current: 'true' });
    const year = seasons.response?.[0]?.seasons?.find((s) => s.current)?.year ?? new Date().getUTCFullYear();
    const body = await get<AfStandingsResponse>('/standings', { league: afLeague, season: year });
    const first = body.response?.[0];
    return first ? mapStandings(first) : null;
  });
  if (!r.ok) return { kind: 'error' };
  return r.value ? { kind: 'found', data: r.value } : { kind: 'missing' };
}
