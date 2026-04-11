import { liveScoreApi } from './api';
import {
  ApiResponse,
  FixtureListItem,
  LiveMatchData,
  Match,
} from '../models/liveScore';
import { MatchEvent, MatchStatsData } from '../models/domain';
import { compareGroupedLeagues } from '../config/leagues';

export type PaginatedMatches = {
  matches: Match[];
  totalPages: number;
  page: number;
};

function parseTotalPages(data: unknown): number {
  if (data == null || typeof data !== 'object') return 1;
  const raw = (data as { total_pages?: unknown }).total_pages;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

// Endpoint: GET /matches/live.json?page=
export const getLiveMatches = async (page = 1): Promise<PaginatedMatches> => {
  try {
    const response = await liveScoreApi.get<ApiResponse<LiveMatchData>>('/matches/live', {
      params: { page },
    });
    if (response.data.success && response.data.data?.match) {
      const matches = response.data.data.match;
      return {
        matches,
        totalPages: parseTotalPages(response.data.data),
        page,
      };
    }
    return { matches: [], totalPages: 1, page };
  } catch (error) {
    console.error('Error fetching live matches', error);
    return { matches: [], totalPages: 1, page };
  }
};

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `fixtures/list` zamanını `utcTimeToTr` ile uyumlu "HH:MM" (UTC varsayımı) yapar */
function fixtureTimeToScheduledHm(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const t = raw.trim();
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : undefined;
}

export function normalizeFixtureToMatch(raw: FixtureListItem): Match {
  const home = raw.home ?? { id: 0, name: '' };
  const away = raw.away ?? { id: 0, name: '' };
  const scheduled = fixtureTimeToScheduledHm(raw.time);
  return {
    id: raw.id,
    status: 'NOT STARTED',
    time: '',
    date: raw.date,
    scheduled,
    location: raw.location,
    home,
    away,
    country: raw.country,
    competition: raw.competition,
    fixture_id: raw.id,
  };
}

// Endpoint: GET /fixtures/list.json?date=YYYY-MM-DD veya today
export async function getFixturesByDate(isoDate: string): Promise<Match[]> {
  try {
    const dateParam = isoDate === todayIsoUtc() ? 'today' : isoDate;
    const response = await liveScoreApi.get<
      ApiResponse<{ fixtures?: FixtureListItem[] }>
    >('/fixtures/list', {
      params: { date: dateParam },
    });
    const list = response.data.data?.fixtures;
    if (response.data.success && Array.isArray(list)) {
      return list.map((f) => normalizeFixtureToMatch(f));
    }
    return [];
  } catch (error) {
    console.error('Error fetching fixtures', error);
    return [];
  }
}

export const getTodayFixtures = (): Promise<Match[]> => getFixturesByDate('today');

export function isLiveMatchOnSelectedDate(m: Match, selectedDate: string): boolean {
  const d = m.date?.trim();
  if (d) return d === selectedDate;
  return selectedDate === todayIsoUtc();
}

export type MergeMatchesForAllTabInput = {
  selectedDate: string;
  historyPageMatches: Match[];
  liveMatches: Match[];
  fixtures: Match[];
};

/** Aynı id: fikstür < history < live (live en güncel); çıktı id ile tekilleştirilir */
export function mergeMatchesForAllTab(input: MergeMatchesForAllTabInput): Match[] {
  const { selectedDate, historyPageMatches, liveMatches, fixtures } = input;
  const liveOnDay = liveMatches.filter((m) => isLiveMatchOnSelectedDate(m, selectedDate));
  const map = new Map<number, Match>();
  for (const f of fixtures) {
    const id = Number(f.id);
    if (Number.isFinite(id)) map.set(id, f);
  }
  for (const h of historyPageMatches) {
    const id = Number(h.id);
    if (Number.isFinite(id)) map.set(id, h);
  }
  for (const l of liveOnDay) {
    const id = Number(l.id);
    if (Number.isFinite(id)) map.set(id, l);
  }
  return dedupeMatchesById(Array.from(map.values()));
}

function allTabStatusRank(m: Match): number {
  if (m.status === 'IN PLAY') return 0;
  if (m.status === 'HALF TIME BREAK') return 1;
  if (m.status === 'NOT STARTED') return 2;
  if (m.status === 'FINISHED') return 3;
  return 4;
}

function kickoffSortKey(m: Match): string {
  const s = (m.scheduled ?? m.time ?? '').trim();
  const hm = /^\d{2}:\d{2}/.exec(s)?.[0];
  return hm ?? '99:99';
}

function compareMatchesForAllTab(a: Match, b: Match): number {
  const ra = allTabStatusRank(a);
  const rb = allTabStatusRank(b);
  if (ra !== rb) return ra - rb;
  return kickoffSortKey(a).localeCompare(kickoffSortKey(b));
}

// Endpoint: GET /matches/history.json?from=&to=&page=
export const getMatchesByDate = async (date: string, page = 1): Promise<PaginatedMatches> => {
  try {
    const response = await liveScoreApi.get(`/matches/history`, {
      params: { from: date, to: date, page },
    });

    if (response.data.success && Array.isArray(response.data.data?.match)) {
      return {
        matches: response.data.data.match,
        totalPages: parseTotalPages(response.data.data),
        page,
      };
    }
    return { matches: [], totalPages: 1, page };
  } catch (error) {
    console.error('Error fetching matches by date', error);
    return { matches: [], totalPages: 1, page };
  }
};

/** API sayfaları arasında aynı maç tekrarlanabiliyor — tekilleştir */
export function dedupeMatchesById(matches: Match[]): Match[] {
  const map = new Map<number, Match>();
  for (const m of matches) {
    const id = Number(m.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, m);
  }
  return Array.from(map.values());
}

/** Seçilen günün tüm history sayfalarını çeker (Hepsi / lig grupları için) */
export async function getAllMatchesByDate(date: string): Promise<Match[]> {
  const first = await getMatchesByDate(date, 1);
  const { totalPages, matches: firstMatches } = first;
  if (totalPages <= 1) return dedupeMatchesById(firstMatches);

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => getMatchesByDate(date, i + 2))
  );
  const combined = [...firstMatches, ...rest.flatMap((r) => r.matches)];
  return dedupeMatchesById(combined);
}

/** Tüm canlı sayfaları — history pagination ile aynı `page` kullanılmamalı */
export async function getAllLiveMatches(): Promise<Match[]> {
  const first = await getLiveMatches(1);
  const { totalPages, matches: firstMatches } = first;
  if (totalPages <= 1) return dedupeMatchesById(firstMatches);

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => getLiveMatches(i + 2))
  );
  const combined = [...firstMatches, ...rest.flatMap((r) => r.matches)];
  return dedupeMatchesById(combined);
}

export interface Head2HeadTeamBrief {
  id: string;
  name: string;
  overall_form?: string[];
  h2h_form?: string[];
}

/** `teams/head2head` cevabındaki `data.h2h` geçmiş maçlar */
export interface Head2HHistoricalMatch {
  id: string;
  date?: string;
  scheduled?: string;
  home_name?: string;
  away_name?: string;
  score?: string;
  ht_score?: string;
  time?: string;
  status?: string;
}

export interface Head2HeadData {
  team1: Head2HeadTeamBrief;
  team2: Head2HeadTeamBrief;
  h2h?: Head2HHistoricalMatch[];
}

// Endpoint: GET /teams/head2head.json?team1_id=&team2_id=
export const getTeamsHead2Head = async (
  team1Id: string,
  team2Id: string
): Promise<Head2HeadData | null> => {
  try {
    const response = await liveScoreApi.get<ApiResponse<Head2HeadData>>(`/teams/head2head`, {
      params: { team1_id: team1Id, team2_id: team2Id },
    });
    if (response.data.success && response.data.data?.team1 && response.data.data?.team2) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching head2head', error);
    return null;
  }
};

// Endpoint: GET /matches/events.json?match_id=X
// Returns both match details and events
export const getMatchWithEvents = async (
  matchId: string
): Promise<{ match: Match | null; events: MatchEvent[] }> => {
  try {
    const response = await liveScoreApi.get(`/matches/events`, {
      params: { match_id: matchId },
    });
    if (response.data.success && response.data.data) {
      const matchData = response.data.data.match || null;
      const eventsData = response.data.data.event || [];
      return { match: matchData, events: eventsData };
    }
    return { match: null, events: [] };
  } catch (error) {
    console.error('Error fetching match events', error);
    return { match: null, events: [] };
  }
};

// Endpoint: GET /matches/stats.json?match_id=X
export const getMatchStats = async (matchId: string): Promise<MatchStatsData | null> => {
  try {
    const response = await liveScoreApi.get(`/matches/stats`, {
      params: { match_id: matchId },
    });
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching stats', error);
    return null;
  }
};

// Endpoint: GET /matches/lineups.json?match_id=X
export const getMatchLineups = async (matchId: string): Promise<any | null> => {
  try {
    const response = await liveScoreApi.get(`/matches/lineups`, {
      params: { match_id: matchId },
    });
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching lineups', error);
    return null;
  }
};

// Endpoint: GET /teams/last-matches.json?team_id=X&number=10
export const getTeamLastMatches = async (teamId: string, count = 10): Promise<Match[]> => {
  try {
    // `teams/last-matches.json` may be unavailable in some accounts.
    // We fallback to history endpoint and take latest N matches.
    const response = await liveScoreApi.get(`/matches/history`, {
      params: { team_id: teamId, from: '2024-01-01', to: '2030-12-31' },
    });
    if (response.data.success && Array.isArray(response.data.data?.match)) {
      return response.data.data.match.slice(0, count);
    }
    return [];
  } catch (error) {
    console.error('Error fetching team last matches', error);
    return [];
  }
};

export const getTeamCompetitions = (matches: Match[], teamId: string) => {
  const seen = new Set<number>();
  const list: Array<{ id: number; name: string }> = [];

  matches.forEach((m) => {
    const compId = m.competition?.id;
    const compName = m.competition?.name;
    const includesTeam =
      m.home?.id?.toString() === teamId || m.away?.id?.toString() === teamId;

    if (!includesTeam || !compId || !compName || seen.has(compId)) return;
    seen.add(compId);
    list.push({ id: compId, name: compName });
  });

  return list;
};

// Endpoint: GET /competitions/squads.json?team_id=X&competition_id=Y
export const getTeamSquads = async (teamId: string, competitionId: string): Promise<any> => {
  try {
    const response = await liveScoreApi.get(`/competitions/squads`, {
      params: { team_id: teamId, competition_id: competitionId },
    });
    if (response.data.success && response.data.data) {
      if (Array.isArray(response.data.data) && response.data.data.length > 0) {
        return response.data.data;
      }
      if (Array.isArray(response.data.data?.players)) {
        return response.data.data.players;
      }
    }
    // Fallback: rosters endpoint
    const rosterRes = await liveScoreApi.get(`/competitions/rosters`, {
      params: { competition_id: competitionId },
    });
    if (rosterRes.data.success && Array.isArray(rosterRes.data.data?.teams)) {
      const teams = rosterRes.data.data.teams;
      const target = teams.find((t: any) => String(t?.team?.id) === String(teamId));
      if (Array.isArray(target?.players)) return target.players;
    }
    return [];
  } catch (error) {
    console.error('Error fetching team squads', error);
    return [];
  }
};

/** `competitions/table.json` tam cevap — maç detayı puan durumu için */
export type CompetitionTableStandingRow = {
  rank: number;
  points: number;
  matches: number;
  goal_diff: number;
  goals_scored?: number;
  goals_conceded?: number;
  won: number;
  drawn: number;
  lost: number;
  team?: { id: number; name: string; logo?: string };
  team_id?: number;
  name?: string;
  logo?: string;
};

export type CompetitionTableData = {
  competition?: { id: number; name: string };
  season?: { id?: number; name?: string; start?: string; end?: string };
  stages?: Array<{
    stage?: { id?: number; name?: string };
    groups?: Array<{
      id?: number;
      name?: string;
      standings?: CompetitionTableStandingRow[];
    }>;
  }>;
  table?: CompetitionTableStandingRow[];
};

export const getCompetitionTableFull = async (
  competitionId: string
): Promise<CompetitionTableData | null> => {
  try {
    const response = await liveScoreApi.get(`/competitions/table`, {
      params: { competition_id: competitionId },
    });
    if (response.data.success && response.data.data) {
      return response.data.data as CompetitionTableData;
    }
    return null;
  } catch (error) {
    console.error('Error fetching competition table (full)', error);
    return null;
  }
};

// Endpoint: GET /competitions/table.json?competition_id=X
export const getLeagueTable = async (competitionId: string): Promise<any> => {
  try {
    const response = await liveScoreApi.get(`/competitions/table`, {
      params: { competition_id: competitionId },
    });
    if (response.data.success && response.data.data) {
      // Supports both old `table` shape and current `stages/groups/standings` shape
      if (Array.isArray(response.data.data.table)) {
        return response.data.data.table;
      }

      const stages = response.data.data.stages;
      if (Array.isArray(stages)) {
        const flattened = stages.flatMap((stage: any) =>
          (stage.groups || []).flatMap((group: any) =>
            (group.standings || []).map((standing: any) => ({
              rank: standing.rank,
              points: standing.points,
              matches: standing.matches,
              goal_diff: standing.goal_diff,
              goals_scored: standing.goals_scored,
              goals_conceded: standing.goals_conceded,
              won: standing.won,
              drawn: standing.drawn,
              lost: standing.lost,
              team_id: standing.team?.id,
              name: standing.team?.name,
              logo: standing.team?.logo,
              group_name: group.name,
            }))
          )
        );
        return flattened;
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching league table', error);
    return null;
  }
};

// Endpoint: GET /competitions/topscorers.json?competition_id=X
export const getTopScorers = async (competitionId: string): Promise<any> => {
  try {
    const response = await liveScoreApi.get(`/competitions/topscorers`, {
      params: { competition_id: competitionId },
    });
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.error('Error fetching top scorers', error);
    return [];
  }
};

// Endpoint: GET /competitions/topdisciplinary.json?competition_id=X
export const getTopDisciplinary = async (competitionId: string): Promise<any> => {
  try {
    const response = await liveScoreApi.get(`/competitions/topdisciplinary`, {
      params: { competition_id: competitionId },
    });
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.error('Error fetching top disciplinary', error);
    return [];
  }
};

// Group matches by league with priority sorting
export type GroupedLeagueMatches = {
  competition_id: number;
  competition_name: string;
  /** `match.country.id` — bayrak: `/api/livescore/countries/flag?country_id=` */
  country_id?: number;
  country_name?: string;
  /** API’de yalnızca dosya adı (örn. BIH.png); görüntü URL’si değil */
  country_flag?: string;
  competition_logo?: string;
  matches: Match[];
};

export const groupMatchesByLeague = (matches: Match[]): GroupedLeagueMatches[] => {
  const grouped: Record<string, GroupedLeagueMatches> = {};

  matches.forEach((match) => {
    const compId = match.competition?.id || 0;
    const compName = match.competition?.name || '';

    if (!grouped[compId]) {
      grouped[compId] = {
        competition_id: compId,
        competition_name: compName,
        country_id: match.country?.id,
        country_name: match.country?.name,
        country_flag: match.country?.flag,
        competition_logo: match.competition?.logo,
        matches: [],
      };
    } else {
      const g = grouped[compId];
      if (g.country_id == null && match.country?.id != null) {
        g.country_id = match.country.id;
        g.country_name = match.country.name;
        g.country_flag = match.country.flag;
      }
      if (!g.competition_logo && match.competition?.logo) g.competition_logo = match.competition.logo;
    }
    grouped[compId].matches.push(match);
  });

  return Object.values(grouped).sort(compareGroupedLeagues);
};

export function sortGroupedMatchesForAllTab(
  groups: GroupedLeagueMatches[]
): GroupedLeagueMatches[] {
  return groups.map((g) => ({
    ...g,
    matches: [...g.matches].sort(compareMatchesForAllTab),
  }));
}
