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
    group_id: raw.group_id,
    group_name: raw.group_name,
  };
}

// Endpoint: GET /fixtures/list.json?date=YYYY-MM-DD (API `today` değerini güvenilir kabul etmiyor)
export async function getFixturesByDate(isoDate: string): Promise<Match[]> {
  try {
    const trimmed = isoDate.trim();
    const dateParam =
      !trimmed || trimmed.toLowerCase() === 'today' ? todayIsoUtc() : trimmed;
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

export const getTodayFixtures = (): Promise<Match[]> => getFixturesByDate(todayIsoUtc());

// Endpoint: GET /fixtures/list.json?competition_id=362&group_id=4297
export async function getCompetitionGroupFixtures(
  competitionId: string,
  groupId: number | string
): Promise<Match[]> {
  try {
    const response = await liveScoreApi.get<
      ApiResponse<{ fixtures?: FixtureListItem[] }>
    >('/fixtures/list', {
      params: { competition_id: competitionId, group_id: groupId },
    });
    const list = response.data.data?.fixtures;
    if (response.data.success && Array.isArray(list)) {
      return list.map((f) => normalizeFixtureToMatch(f));
    }
    return [];
  } catch (error) {
    console.error('Error fetching competition group fixtures', error);
    return [];
  }
}

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

/** Fikstür / history / canlı satırlarını ortak anahtarla eşler: önce `fixture_id`, yoksa `id`. */
function mergeMatchMapKey(m: Match): number | null {
  const fid = m.fixture_id != null && Number(m.fixture_id) > 0 ? Number(m.fixture_id) : null;
  if (fid != null) return fid;
  const id = Number(m.id);
  return Number.isFinite(id) ? id : null;
}

function mergeMatchRow(base: Match, overlay: Match): Match {
  return {
    ...base,
    ...overlay,
    id: overlay.id,
    fixture_id: base.fixture_id ?? overlay.fixture_id ?? base.id,
    scheduled: overlay.scheduled ?? base.scheduled,
    date: overlay.date ?? base.date,
  };
}

/**
 * Fikstür + günlük history + canlı birleşimi.
 * Öncelik: fikstür (temel) < history < live (`fixture_id` ile eşleşirse aynı satır güncellenir).
 */
export function mergeMatchesForAllTab(input: MergeMatchesForAllTabInput): Match[] {
  const { selectedDate, historyPageMatches, liveMatches, fixtures } = input;
  const liveOnDay = liveMatches.filter((m) => isLiveMatchOnSelectedDate(m, selectedDate));
  const map = new Map<number, Match>();

  const put = (m: Match) => {
    const k = mergeMatchMapKey(m);
    if (k == null) return;
    const existing = map.get(k);
    map.set(k, existing ? mergeMatchRow(existing, m) : m);
  };

  for (const f of fixtures) put(f);
  for (const h of historyPageMatches) put(h);
  for (const l of liveOnDay) put(l);

  return dedupeMatchesById(Array.from(map.values()));
}

/**
 * `fixtures/list` fikstür satırlarını history + canlı ile `fixture_id` üzerinden birleştirir.
 * Maç detay linki için `id` alanı canlı/bitmiş maçın `id` değerine çekilir.
 */
export function mergeFixturesWithHistoryAndLive(
  fixtures: Match[],
  history: Match[],
  live: Match[],
): Match[] {
  const byFixture = new Map<number, Match>();
  const register = (m: Match) => {
    const fid = m.fixture_id != null && Number(m.fixture_id) > 0 ? Number(m.fixture_id) : null;
    if (fid == null) return;
    byFixture.set(fid, m);
  };
  for (const h of history) register(h);
  for (const l of live) register(l);

  return fixtures.map((f) => {
    const fid = f.fixture_id != null && Number(f.fixture_id) > 0 ? Number(f.fixture_id) : Number(f.id);
    const overlay = Number.isFinite(fid) ? byFixture.get(fid) : undefined;
    if (!overlay) return f;
    return mergeMatchRow(f, overlay);
  });
}

/** `matches/history` — `competition_id` ile sayfalanmış tüm maçlar (sayfa başına max 30). */
export async function getAllCompetitionHistoryMatches(
  competitionId: string,
  opts?: { from?: string; to?: string; maxPages?: number },
): Promise<Match[]> {
  const maxPages = Math.max(1, opts?.maxPages ?? 35);
  try {
    const first = await liveScoreApi.get<{ success?: boolean; data?: { match?: Match[] } & Record<string, unknown> }>(
      `/matches/history`,
      {
        params: {
          competition_id: competitionId,
          page: 1,
          ...(opts?.from ? { from: opts.from } : {}),
          ...(opts?.to ? { to: opts.to } : {}),
        },
      },
    );
    if (!first.data.success || !Array.isArray(first.data.data?.match)) return [];

    const firstMatches = first.data.data.match;
    const totalPages = parseTotalPages(first.data.data);
    const pagesToFetch = Math.min(totalPages, maxPages);
    if (pagesToFetch <= 1) return dedupeMatchesById(firstMatches);

    const rest = await Promise.all(
      Array.from({ length: pagesToFetch - 1 }, (_, i) =>
        liveScoreApi.get<{ success?: boolean; data?: { match?: Match[] } }>(`/matches/history`, {
          params: {
            competition_id: competitionId,
            page: i + 2,
            ...(opts?.from ? { from: opts.from } : {}),
            ...(opts?.to ? { to: opts.to } : {}),
          },
        }),
      ),
    );
    const combined = [
      ...firstMatches,
      ...rest.flatMap((r) => (r.data.success && Array.isArray(r.data.data?.match) ? r.data.data.match : [])),
    ];
    return dedupeMatchesById(combined);
  } catch (error) {
    console.error('Error fetching competition history matches', error);
    return [];
  }
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
  const first = await getLiveMatches();
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

function mergeMatchRefereeFromPayload(match: Match | null): Match | null {
  if (!match) return null;
  if (typeof match.referee === 'string' && match.referee.trim()) return match;
  const raw = match as unknown as Record<string, unknown>;
  const alt =
    (typeof raw.referee_name === 'string' && raw.referee_name.trim()) ||
    (typeof raw.official === 'string' && raw.official.trim()) ||
    '';
  return alt ? { ...match, referee: alt } : match;
}

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
      const matchData = mergeMatchRefereeFromPayload(response.data.data.match || null);
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

export type CompetitionGroupItem = {
  id: number;
  name: string;
  stage?: string;
};

/** Global seasons list (`seasons/list.json`); `id` normalized to number */
export type SeasonListItem = {
  id: number;
  name: string;
  start?: string;
  end?: string;
};

function seasonSortKey(s: SeasonListItem): number {
  const end = s.end?.trim();
  if (end) {
    const t = Date.parse(end);
    if (Number.isFinite(t)) return t;
  }
  const start = s.start?.trim();
  if (start) {
    const t = Date.parse(start);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

const SEASON_LIST_MIN_END = Date.parse('2000-01-01');

/** "2025/2026" veya "2025 / 2026" → [2025,2026] */
function parseSlashSeasonYears(name: string): { a: number; b: number } | null {
  const m = /^(\d{4})\s*\/\s*(\d{4})$/.exec(name.trim());
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

/**
 * Aynı yılı hem "YYYY" hem "YYYY/ZZZZ" olarak listeleyen API tekrarını kaldırır
 * (ör. "2025" + "2025/2026" → yalnızca split sezon kalır).
 */
function dedupeCalendarYearSeasons(items: SeasonListItem[]): SeasonListItem[] {
  const plainYear = /^\d{4}$/;
  const dropIds = new Set<number>();
  const slashPairs: { a: number; b: number }[] = items
    .map((s) => parseSlashSeasonYears(s.name))
    .filter((pair): pair is { a: number; b: number } => pair != null);

  for (const t of items) {
    const n = t.name.trim();
    if (!plainYear.test(n)) continue;
    const y = parseInt(n, 10);
    for (const pair of slashPairs) {
      if (y === pair.a || y === pair.b) {
        dropIds.add(t.id);
        break;
      }
    }
  }
  return items.filter((s) => !dropIds.has(s.id));
}

function filterSeasonListForUi(items: SeasonListItem[]): SeasonListItem[] {
  return items.filter((s) => {
    const end = s.end?.trim();
    if (end) {
      const t = Date.parse(end);
      return Number.isFinite(t) && t >= SEASON_LIST_MIN_END;
    }
    const start = s.start?.trim();
    if (start) {
      const t = Date.parse(start);
      return Number.isFinite(t) && t >= SEASON_LIST_MIN_END;
    }
    return true;
  });
}

export type GetSeasonsListOptions = {
  /**
   * `true` iken `YYYY` ile `YYYY/ZZZZ` çakışan düz yıl satırları silinmez.
   * Dünya Kupası gibi düz yıl sezon id'lerinin (örn. "2026") dropdown'da kalması için gerekir.
   */
  skipCalendarYearDedupe?: boolean;
};

// Endpoint: GET /seasons/list.json
export async function getSeasonsList(opts?: GetSeasonsListOptions): Promise<SeasonListItem[]> {
  try {
    const response = await liveScoreApi.get<{
      success?: boolean;
      data?: { seasons?: unknown[] };
    }>('/seasons/list');
    const raw = response.data.data?.seasons;
    if (!response.data.success || !Array.isArray(raw)) return [];

    const parsed = raw
      .map((row): SeasonListItem | null => {
        if (row == null || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const idRaw = r.id;
        const id = typeof idRaw === 'string' ? parseInt(idRaw, 10) : Number(idRaw);
        const name = typeof r.name === 'string' ? r.name : '';
        if (!Number.isFinite(id) || !name.trim()) return null;
        const start = typeof r.start === 'string' ? r.start : undefined;
        const end = typeof r.end === 'string' ? r.end : undefined;
        return { id, name: name.trim(), start, end };
      })
      .filter((x): x is SeasonListItem => x != null);

    const uiFiltered = filterSeasonListForUi(parsed);
    const filtered = opts?.skipCalendarYearDedupe
      ? uiFiltered
      : dedupeCalendarYearSeasons(uiFiltered);
    return filtered.sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
  } catch (error) {
    console.error('Error fetching seasons list', error);
    return [];
  }
}

type CompetitionTableQuery = {
  group_id?: number | string;
  season?: number;
};

export const getCompetitionTableFull = async (
  competitionId: string,
  query?: CompetitionTableQuery
): Promise<CompetitionTableData | null> => {
  try {
    const params: Record<string, string | number> = {
      competition_id: competitionId,
    };
    if (query?.group_id != null && query.group_id !== '') {
      params.group_id = query.group_id;
    }
    /** Upstream: `season_id` (not `season`) — yoksa güncel sezon döner */
    if (query?.season != null && Number.isFinite(query.season)) {
      params.season_id = query.season;
    }
    const response = await liveScoreApi.get(`/competitions/table`, {
      params,
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

export const getCompetitionGroups = async (
  competitionId: string
): Promise<CompetitionGroupItem[]> => {
  try {
    const response = await liveScoreApi.get<{
      success?: boolean;
      data?: CompetitionGroupItem[];
    }>(`/competitions/groups`, {
      params: { competition_id: competitionId },
    });
    if (response.data.success && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.error('Error fetching competition groups', error);
    return [];
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

/** `competitions/topscorers.json` cevabındaki `data` gövdesi */
export type TopScorerEntry = {
  goals: number;
  assists?: number;
  played?: number;
  team?: { id?: number; name?: string; logo?: string };
  player?: { id?: number; name?: string; photo?: string };
};

export type TopScorersPayload = {
  competition?: { id?: number; name?: string };
  season?: { id?: number; name?: string; start?: string; end?: string };
  topscorers?: TopScorerEntry[];
};

// Endpoint: GET /competitions/topscorers.json?competition_id=X (&season_id= dokümanda yok; tablo ile aynı parametre)
export const getTopScorers = async (
  competitionId: string,
  opts?: { season?: number }
): Promise<TopScorersPayload | null> => {
  try {
    const params: Record<string, string | number> = {
      competition_id: competitionId,
    };
    if (opts?.season != null && Number.isFinite(opts.season)) {
      params.season_id = opts.season;
    }
    const response = await liveScoreApi.get<{ success?: boolean; data?: TopScorersPayload }>(
      `/competitions/topscorers`,
      {
        params,
      }
    );
    if (response.data.success && response.data.data) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching top scorers', error);
    return null;
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
