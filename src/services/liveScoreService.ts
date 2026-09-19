import { getLiveScoreHttpClient } from './liveScoreHttpContext';
import {
  ApiResponse,
  FixtureListItem,
  LiveMatchData,
  Match,
} from '../models/liveScore';
import { MatchEvent, MatchStatsData } from '../models/domain';
import {
  compareGroupedLeagues,
  TURKEY_COMPETITION_IDS,
  UEFA_TIER2_COMPETITION_IDS,
  BIG_FIVE_COMPETITION_ORDER,
} from '../config/leagues';
import { WORLD_CUP_COMPETITION_ID } from '../config/worldCup';
import { isSportmonksProviderEnabled, resolveSportmonksLeagueId } from './sportmonksProviderFlag';
import { sportmonksClientRequest, sportmonksCollectAllPages } from './sportmonksRuntimeClient';
import { mapSportmonksFixtureToMatch } from './sportmonksFixtureMapper';
import {
  mapSportmonksEvents,
  mapSportmonksLineups,
  mapSportmonksStatistics,
  mapTopscorerRowsToEntries,
  extractAppearances,
  extractSquadStats,
  extractTeamTopScorers,
  type TeamTopScorer,
  type SquadStatLine,
  GOAL_TOPSCORER_TYPE_ID,
  ASSIST_TOPSCORER_TYPE_ID,
  mergeDisciplinaryRows,
  DISCIPLINARY_TYPE_IDS,
} from './sportmonksKatman2Mapper';
import { checkFilteredResult } from './sportmonks/filterAssertion';
import { resolvePositionShortCode } from './sportmonks/typeDictionaries';
import type {
  SportmonksFixture,
  SportmonksSeasonRow,
  SportmonksSquadRow,
  SportmonksStandingRow,
  SportmonksSquadStatsRow,
  SportmonksTopscorerRow,
} from './sportmonks/types';
import { pivotStandingRow } from './sportmonks/standingsPivot';

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

// ─── Sportmonks (Faz 2) — Katman-1 yardımcıları ────────────────────────────
// docs/SPORTMONKS_MIGRATION.md Pass 1'de eşlenen 5 Katman-1 fonksiyonunun
// (getAllLiveMatches/getLiveMatches, getFixturesByDate, getFixturesByCompetition,
// getAllMatchesByDate, getAllCompetitionHistoryMatches) ortak Sportmonks tarafı.
// Yalnızca `isSportmonksProviderEnabled()` true iken devrede — flag kapalıyken
// bu bölümdeki hiçbir kod çalışmaz, aşağıdaki legacy (livescore-api.com) kod
// yolları olduğu gibi kalır.

/**
 * Pass 1-3'te doğrulanan tüm alanları (skor, dakika, konum, hakem, tur/faz, grup)
 * doldurmak için gereken include seti — tek bir kombine istek, ayrı ayrı çağrı yok.
 * Bu kombinasyonun tamamı tek istekte BİRLİKTE raporda test edilmedi (her include
 * kendi pass'inde tek başına doğrulandı) ama Sportmonks'un include sözdizimi
 * (`;` ile ayrılmış liste) standart, birleştirmek dokümante edilmiş bir davranış.
 */
const SPORTMONKS_FIXTURE_INCLUDE =
  'participants;scores;state;periods;league.country;venue;referees.referee;round;stage;group';

/** Pass 5: `/fixtures/date` 50'yi kabul etti — diğer fixture endpoint'leri için de güvenli üst sınır. */
const SPORTMONKS_FIXTURE_PER_PAGE = 50;

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sportmonksFetchAllLiveMatches(): Promise<Match[]> {
  const rows = await sportmonksCollectAllPages<SportmonksFixture>({
    basePath: 'football',
    path: '/livescores/inplay',
    perPage: SPORTMONKS_FIXTURE_PER_PAGE,
    extraParams: { include: SPORTMONKS_FIXTURE_INCLUDE },
  });
  return dedupeMatchesById(rows.map(mapSportmonksFixtureToMatch));
}

async function sportmonksFetchFixturesByDate(isoDate: string): Promise<Match[]> {
  const rows = await sportmonksCollectAllPages<SportmonksFixture>({
    basePath: 'football',
    path: `/fixtures/date/${isoDate}`,
    perPage: SPORTMONKS_FIXTURE_PER_PAGE,
    extraParams: { include: SPORTMONKS_FIXTURE_INCLUDE },
  });
  return dedupeMatchesById(rows.map(mapSportmonksFixtureToMatch));
}

/** Pass 3: 100 günden uzun bir `/fixtures/between` aralığı 422 veriyor — güvenli üst sınır. */
const SPORTMONKS_MAX_RANGE_DAYS = 90;

/** `from`→`to` aralığını, 100 günlük Sportmonks limitini aşmayan ardışık parçalara böler. */
function chunkSportmonksDateRange(
  from: string,
  to: string,
  maxDays = SPORTMONKS_MAX_RANGE_DAYS,
): Array<{ from: string; to: string }> {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    return [{ from, to }];
  }
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);
    const clampedEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({
      from: cursor.toISOString().slice(0, 10),
      to: clampedEnd.toISOString().slice(0, 10),
    });
    cursor = new Date(clampedEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

/**
 * `getAllMatchesByDate` + `getAllCompetitionHistoryMatches` ortak primitifi
 * (Pass 1: "ikisi de aynı /fixtures/between primitifine düşüyor, sadece tarih
 * aralığı farklı"). `sportmonksLeagueId` verilmezse filtresiz (tüm ligler) çeker.
 */
async function sportmonksFetchFixturesBetween(
  from: string,
  to: string,
  sportmonksLeagueId?: number,
  maxPages?: number,
): Promise<Match[]> {
  const ranges = chunkSportmonksDateRange(from, to);
  const all: Match[] = [];
  // Sıralı — pagination.ts'in "has_more bitene kadar sırayla" prensibiyle
  // tutarlı, aynı zamanda Fixture kota havuzunu (Pass 1 Genel Bulgu 4)
  // gereksiz paralel isteklerle boşaltmamak için.
  for (const range of ranges) {
    const rows = await sportmonksCollectAllPages<SportmonksFixture>({
      basePath: 'football',
      path: `/fixtures/between/${range.from}/${range.to}`,
      perPage: SPORTMONKS_FIXTURE_PER_PAGE,
      maxPages,
      extraParams: {
        include: SPORTMONKS_FIXTURE_INCLUDE,
        ...(sportmonksLeagueId != null ? { filters: `fixtureLeagues:${sportmonksLeagueId}` } : {}),
      },
    });
    if (sportmonksLeagueId != null) {
      // Pass 5 "Risk kategorisi notu": filters=... sessizce uygulanmayabiliyor
      // (200 OK ama filtresiz sonuç) — dönen her satırın league_id'sini doğrula.
      const check = checkFilteredResult(rows, [sportmonksLeagueId], (r) => r.league_id ?? r.league?.id ?? '');
      if (!check.ok) {
        console.error(
          `[sportmonks] filters=fixtureLeagues:${sportmonksLeagueId} sessizce uygulanmadı, bu tarih aralığı atlandı (${range.from}–${range.to}):`,
          check.reason,
        );
        continue; // beklenmeyen ligden veri sızdırmaktansa o parçayı tamamen atla
      }
    }
    all.push(...rows.map(mapSportmonksFixtureToMatch));
  }
  return dedupeMatchesById(all);
}

// ─── /Sportmonks yardımcıları ───────────────────────────────────────────────

// Endpoint: GET /matches/live.json?page= (flag kapalı) | GET /livescores/inplay (flag açık — Pass 1)
export const getLiveMatches = async (page = 1): Promise<PaginatedMatches> => {
  if (isSportmonksProviderEnabled()) {
    try {
      // Sportmonks'ta "total_pages" yok (Pass 1 Genel Bulgu 1) — tüm sayfalar
      // sportmonksCollectAllPages içinde zaten sırayla tüketiliyor, çağırana tek
      // "sayfa" olarak dönülüyor (totalPages:1 → getAllLiveMatches'taki mevcut
      // pagination döngüsü ek istek atmadan kısa devre yapar).
      const matches = await sportmonksFetchAllLiveMatches();
      return { matches, totalPages: 1, page: 1 };
    } catch (error) {
      console.error('Error fetching live matches (sportmonks)', error);
      return { matches: [], totalPages: 1, page };
    }
  }
  try {
    const response = await getLiveScoreHttpClient().get<ApiResponse<LiveMatchData>>('/matches/live', {

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
    home,
    away,
    fixture_id: raw.id,
    ...(raw.date !== undefined ? { date: raw.date } : {}),
    ...(scheduled !== undefined ? { scheduled } : {}),
    ...(raw.location !== undefined ? { location: raw.location } : {}),
    ...(raw.country !== undefined ? { country: raw.country } : {}),
    ...(raw.competition !== undefined ? { competition: raw.competition } : {}),
    ...(raw.group_id !== undefined ? { group_id: raw.group_id } : {}),
    ...(raw.group_name !== undefined ? { group_name: raw.group_name } : {}),
    ...(raw.round !== undefined ? { round: raw.round } : {}),
  };
}

// Endpoint: GET /fixtures/list.json?date=YYYY-MM-DD (flag kapalı) | GET /fixtures/date/{date} (flag açık — Pass 1)
export async function getFixturesByDate(isoDate: string): Promise<Match[]> {
  const trimmed = isoDate.trim();
  const dateParam = !trimmed || trimmed.toLowerCase() === 'today' ? todayIsoUtc() : trimmed;

  if (isSportmonksProviderEnabled()) {
    try {
      return await sportmonksFetchFixturesByDate(dateParam);
    } catch (error) {
      console.error('Error fetching fixtures (sportmonks)', error);
      return [];
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get<
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

const KNOWN_COMPETITION_IDS = [
  ...UEFA_TIER2_COMPETITION_IDS,
  ...TURKEY_COMPETITION_IDS,
  ...BIG_FIVE_COMPETITION_ORDER,
  WORLD_CUP_COMPETITION_ID,
];

function fixtureMatchesId(f: Match, matchId: string): boolean {
  return String(f.id) === matchId || (f.fixture_id != null && String(f.fixture_id) === matchId);
}

/**
 * Belirli bir matchId'ye sahip maçı bulur.
 * 1. /matches/events (canlı / geçmiş maçlar)
 * 2. Tarih bazlı fixture listesi — bugün ±2 gün (ilerideki maçlar)
 * 3. Konfigüre edilmiş liglerin competition fixture listesi (UEFA vb. tarih bazlı listede görünmeyebilir)
 */
export async function findMatchById(
  matchId: string,
  opts?: { skipCompetitionFanout?: boolean }
): Promise<{ match: Match | null; events: MatchEvent[]; fromFixture: boolean }> {
  // Adım 1: events endpoint
  const eventsBundle = await getMatchWithEvents(matchId);
  if (eventsBundle.match) {
    return { match: eventsBundle.match, events: eventsBundle.events, fromFixture: false };
  }

  // Adım 2: tarih bazlı arama (bugün ±2)
  const isoOffset = (days: number): string => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const dates = [isoOffset(0), isoOffset(1), isoOffset(-1), isoOffset(2), isoOffset(-2)];
  const dateResults = await Promise.all(dates.map((date) => getFixturesByDate(date).catch(() => [])));
  for (const fixtures of dateResults) {
    const found = fixtures.find((f) => fixtureMatchesId(f, matchId));
    if (found) return { match: found, events: [], fromFixture: true };
  }

  // Adım 3: lig bazlı fixture arama (son çare — SSR'da atlanabilir, client lazy yükler)
  if (opts?.skipCompetitionFanout) {
    return { match: null, events: [], fromFixture: false };
  }

  const compResults = await Promise.all(
    KNOWN_COMPETITION_IDS.map((id) => getFixturesByCompetition(id).catch(() => []))
  );
  for (const fixtures of compResults) {
    const found = fixtures.find((f) => fixtureMatchesId(f, matchId));
    if (found) return { match: found, events: [], fromFixture: true };
  }

  return { match: null, events: [], fromFixture: false };
}

// ─── Sportmonks (Faz 3) — Katman-2/3 yardımcıları ──────────────────────────
// docs/SPORTMONKS_MIGRATION.md Pass 4-5'te eşlenen maç detayı/H2H/sıralama/
// kadro fonksiyonlarının ortak Sportmonks tarafı. Faz 2'deki gibi yalnızca
// `isSportmonksProviderEnabled()` true iken devrede.

/** Tek bir fixture'ı (maç detayı) istenen include'larla çeker — liste değil, tekil kaynak. */
async function sportmonksFetchFixtureDetail(
  fixtureId: string | number,
  include: string,
): Promise<SportmonksFixture | null> {
  const envelope = await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${fixtureId}`, { include });
  return envelope.data ?? null;
}

/** `leagues/{id}?include=seasons` — Pass 4: ayrı bir global `/seasons` endpoint'i yok. */
async function sportmonksFetchLeagueSeasons(leagueId: number): Promise<SportmonksSeasonRow[]> {
  const envelope = await sportmonksClientRequest<{ id: number; seasons?: SportmonksSeasonRow[] }>(
    'football',
    `/leagues/${leagueId}`,
    { include: 'seasons' },
  );
  return envelope.data?.seasons ?? [];
}

function sportmonksPickCurrentSeasonId(seasons: SportmonksSeasonRow[]): number | null {
  return seasons.find((s) => s.is_current)?.id ?? null;
}

/** `competitionId` (livescore-api.com) → doğrulanmış Sportmonks `league_id`, yoksa uyarıp `null`. */
function sportmonksResolveLeagueIdOrWarn(competitionId: number | string, caller: string): number | null {
  const leagueId = resolveSportmonksLeagueId(competitionId);
  if (leagueId == null) {
    console.warn(
      `[sportmonks] ${caller}: competition_id=${competitionId} için doğrulanmış league_id eşlemesi yok ` +
        '(bkz. sportmonksProviderFlag.ts).',
    );
  }
  return leagueId;
}

/** `query.season` verilmemişse `is_current:true` sezonu çözer; hiçbiri yoksa `null`. */
async function sportmonksResolveSeasonId(leagueId: number, explicitSeasonId?: number): Promise<number | null> {
  if (explicitSeasonId != null) return explicitSeasonId;
  const seasons = await sportmonksFetchLeagueSeasons(leagueId);
  return sportmonksPickCurrentSeasonId(seasons);
}

/** Pass 4: `/fixtures/between/{start}/{end}/{team_id}` — sıra ÖNEMLİ, `{team_id}` en sonda. */
const SPORTMONKS_TEAM_HISTORY_WINDOW_PAST_DAYS = 89;

async function sportmonksFetchTeamFixtures(teamId: string): Promise<Match[]> {
  const from = isoDateOffset(-SPORTMONKS_TEAM_HISTORY_WINDOW_PAST_DAYS);
  const to = todayIsoUtc();
  const rows = await sportmonksCollectAllPages<SportmonksFixture>({
    basePath: 'football',
    path: `/fixtures/between/${from}/${to}/${teamId}`,
    perPage: SPORTMONKS_FIXTURE_PER_PAGE,
    extraParams: { include: SPORTMONKS_FIXTURE_INCLUDE },
  });
  const matches = dedupeMatchesById(rows.map(mapSportmonksFixtureToMatch));
  // Upstream artan tarihe göre dönüyor (Pass 4 + Faz 3'te tazelenmiş teyit) — "son maçlar" için en yeni önce.
  return matches.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/**
 * `standings/seasons/{id}` — `group_id` filtresi Sportmonks tarafında dokümante
 * bir query param değil, dönen satırlar client-side süzülüyor.
 */
async function sportmonksFetchStandingsTable(
  leagueId: number,
  seasonId: number,
  groupId?: number | string,
): Promise<{ table: CompetitionTableStandingRow[]; seasonId: number } | null> {
  const rows = await sportmonksCollectAllPages<SportmonksStandingRow>({
    basePath: 'football',
    path: `/standings/seasons/${seasonId}`,
    perPage: 50,
    extraParams: { include: 'participant;details.type' },
  });
  const filtered =
    groupId != null && groupId !== '' ? rows.filter((r) => String(r.group_id ?? '') === String(groupId)) : rows;
  const table = filtered.map((row) => {
    const p = pivotStandingRow(row);
    return {
      rank: p.rank,
      points: p.points,
      matches: p.matches,
      goal_diff: p.goal_diff,
      goals_scored: p.goals_scored,
      goals_conceded: p.goals_conceded,
      won: p.won,
      drawn: p.drawn,
      lost: p.lost,
      team: { id: p.team_id, name: p.name, ...(p.logo ? { logo: p.logo } : {}) },
      team_id: p.team_id,
      name: p.name,
      ...(p.logo ? { logo: p.logo } : {}),
    };
  });
  void leagueId; // ileride competition meta bilgisi zenginleştirilmek istenirse kullanılabilir
  return { table, seasonId };
}

async function sportmonksFetchCompetitionTable(
  competitionId: string,
  query?: CompetitionTableQuery,
): Promise<CompetitionTableData | null> {
  const leagueId = sportmonksResolveLeagueIdOrWarn(competitionId, 'getCompetitionTableFull/getLeagueTable');
  if (leagueId == null) return null;
  const seasonId = await sportmonksResolveSeasonId(leagueId, query?.season);
  if (seasonId == null) return null;
  const result = await sportmonksFetchStandingsTable(leagueId, seasonId, query?.group_id);
  if (!result) return null;
  return {
    competition: { id: leagueId, name: '' },
    season: { id: result.seasonId },
    table: result.table,
  };
}

/** `topscorers/seasons/{id}?filters=seasonTopscorerTypes:{...}` — getTopScorers + getTopDisciplinary'nin ortak primitifi. */
async function sportmonksFetchTopscorerRows(
  competitionId: string,
  explicitSeasonId: number | undefined,
  typeIds: number[],
  caller: string,
): Promise<SportmonksTopscorerRow[] | null> {
  const leagueId = sportmonksResolveLeagueIdOrWarn(competitionId, caller);
  if (leagueId == null) return null;
  const seasonId = await sportmonksResolveSeasonId(leagueId, explicitSeasonId);
  if (seasonId == null) return null;

  const rows = await sportmonksCollectAllPages<SportmonksTopscorerRow>({
    basePath: 'football',
    path: `/topscorers/seasons/${seasonId}`,
    perPage: 50,
    extraParams: { include: 'player;participant', filters: `seasonTopscorerTypes:${typeIds.join(',')}` },
  });
  // Pass 5 "Risk kategorisi notu": filters=... sessizce uygulanmayabiliyor.
  const check = checkFilteredResult(rows, typeIds, (r) => r.type_id);
  if (!check.ok) {
    console.error(`[sportmonks] ${caller}: filters=seasonTopscorerTypes sessizce uygulanmadı:`, check.reason);
    return null;
  }
  return rows;
}

// ─── /Sportmonks Katman-2/3 yardımcıları ───────────────────────────────────

const TEAM_HISTORY_FROM = '2018-01-01';
const TEAM_HISTORY_TO = '2030-12-31';

/**
 * GET /matches/history.json?team_id= (flag kapalı) | GET /fixtures/between/{start}/{end}/{team_id}
 * (flag açık — Pass 4, parametre sırasına dikkat) — takımın geçmiş maçları.
 */
export async function getTeamHistoryMatches(teamId: string): Promise<Match[]> {
  if (isSportmonksProviderEnabled()) {
    try {
      return await sportmonksFetchTeamFixtures(teamId);
    } catch (error) {
      console.error('Error fetching team history matches (sportmonks)', error);
      return [];
    }
  }
  try {
    const response = await getLiveScoreHttpClient().get<{
      success?: boolean;
      data?: { match?: Match[] };
    }>(`/matches/history`, {
      params: { team_id: teamId, from: TEAM_HISTORY_FROM, to: TEAM_HISTORY_TO },
    });
    if (response.data.success && Array.isArray(response.data.data?.match)) {
      return response.data.data.match;
    }
    return [];
  } catch (error) {
    console.error('Error fetching team history matches', error);
    return [];
  }
}

function teamsFaceEachOther(
  m: Match,
  homeTeamId: string,
  awayTeamId: string
): boolean {
  const h = String(m.home?.id ?? '');
  const a = String(m.away?.id ?? '');
  const hi = String(homeTeamId);
  const ai = String(awayTeamId);
  return (h === hi && a === ai) || (h === ai && a === hi);
}

function pickBestHeadToHeadMatch(
  candidates: Match[],
  opts?: { nearDate?: Date | string }
): Match | null {
  if (!candidates.length) return null;

  if (opts?.nearDate) {
    const target = new Date(opts.nearDate).getTime();
    const dated = candidates.filter((m) => m.date?.trim());
    if (dated.length) {
      dated.sort((x, y) => {
        const dx = Math.abs(new Date(x.date!).getTime() - target);
        const dy = Math.abs(new Date(y.date!).getTime() - target);
        return dx - dy;
      });
      return dated[0] ?? null;
    }
  }

  const finished = candidates.filter(
    (m) => String(m.status ?? '').toUpperCase() === 'FINISHED'
  );
  const pool = finished.length ? finished : candidates;
  pool.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return pool[0] ?? null;
}

/** İki takım arasındaki maçı API geçmişinde arar (eski match_id değişmişse). */
export async function findMatchByTeamIds(
  homeTeamId: string,
  awayTeamId: string,
  opts?: { nearDate?: Date | string }
): Promise<Match | null> {
  const [homeHist, awayHist] = await Promise.all([
    getTeamHistoryMatches(homeTeamId),
    getTeamHistoryMatches(awayTeamId),
  ]);
  const seen = new Set<string>();
  const candidates: Match[] = [];
  for (const m of [...homeHist, ...awayHist]) {
    const id = String(m.id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (teamsFaceEachOther(m, homeTeamId, awayTeamId)) candidates.push(m);
  }
  return pickBestHeadToHeadMatch(candidates, opts);
}

// Endpoint: GET /fixtures/list.json?competition_id=362&group_id=4297
export async function getCompetitionGroupFixtures(
  competitionId: string,
  groupId: number | string
): Promise<Match[]> {
  try {
    const response = await getLiveScoreHttpClient().get<
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

/**
 * Sportmonks tarafında `competition_id`nin geçmiş+gelecek varsayılan penceresi.
 * Pass 3: `/fixtures/between` 100 günden uzun aralıkta 422 veriyor — 14+75=89 gün
 * tek istekte kalır (chunkSportmonksDateRange yine de >100 gün istenirse böler).
 */
const SPORTMONKS_COMPETITION_WINDOW_PAST_DAYS = 14;
const SPORTMONKS_COMPETITION_WINDOW_FUTURE_DAYS = 75;

// Endpoint: GET /fixtures/list.json?competition_id=244 (flag kapalı) |
// GET /fixtures/between/{from}/{to}?filters=fixtureLeagues:{id} (flag açık — Pass 1;
// bare `/fixtures` YANLIŞ sonuç veriyor, bkz. rapor — burada asla kullanılmıyor)
export async function getFixturesByCompetition(
  competitionId: number | string
): Promise<Match[]> {
  if (isSportmonksProviderEnabled()) {
    try {
      const leagueId = resolveSportmonksLeagueId(competitionId);
      if (leagueId == null) {
        console.warn(
          `[sportmonks] competition_id=${competitionId} için doğrulanmış league_id eşlemesi yok ` +
            '(bkz. sportmonksProviderFlag.ts) — boş sonuç dönülüyor.',
        );
        return [];
      }
      const from = isoDateOffset(-SPORTMONKS_COMPETITION_WINDOW_PAST_DAYS);
      const to = isoDateOffset(SPORTMONKS_COMPETITION_WINDOW_FUTURE_DAYS);
      return await sportmonksFetchFixturesBetween(from, to, leagueId);
    } catch (error) {
      console.error('Error fetching competition fixtures (sportmonks)', error);
      return [];
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get<
      ApiResponse<{ fixtures?: FixtureListItem[] }>
    >('/fixtures/list', {
      params: { competition_id: competitionId },
    });
    const list = response.data.data?.fixtures;
    if (response.data.success && Array.isArray(list)) {
      return list.map((f) => normalizeFixtureToMatch(f));
    }
    return [];
  } catch (error) {
    console.error('Error fetching competition fixtures', error);
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
 * `mergeMatchesForAllTab`'ın Sportmonks (flag açık) karşılığı — Pass 1 Genel
 * Bulgu 2: Sportmonks'ta `/fixtures/date`, `/fixtures/between` ve
 * `/livescores/inplay` aynı `id`'yi kullanıyor, bu yüzden `fixture_id` tabanlı
 * reconciliation (`mergeMatchMapKey`/`mergeMatchRow`) gereksiz — düz `id` ile
 * eşleyip üstüne yazmak yeterli. `MatchHubPage` bu fonksiyonu yalnızca
 * `isSportmonksProviderEnabled()` true iken çağırır, flag kapalıyken
 * `mergeMatchesForAllTab` olduğu gibi kullanılmaya devam eder.
 */
export function mergeMatchesByIdForAllTab(input: MergeMatchesForAllTabInput): Match[] {
  const { selectedDate, historyPageMatches, liveMatches, fixtures } = input;
  const liveOnDay = liveMatches.filter((m) => isLiveMatchOnSelectedDate(m, selectedDate));
  const map = new Map<number, Match>();

  const put = (m: Match) => {
    const id = Number(m.id);
    if (!Number.isFinite(id)) return;
    const existing = map.get(id);
    map.set(id, existing ? { ...existing, ...m } : m);
  };

  for (const f of fixtures) put(f);
  for (const h of historyPageMatches) put(h);
  for (const l of liveOnDay) put(l);

  return Array.from(map.values());
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

/**
 * Sportmonks tarafında `from`/`to` verilmezse geriye dönük varsayılan pencere
 * ("history"). 89 (→ today dahil 90 takvim günü) `SPORTMONKS_MAX_RANGE_DAYS`
 * (90) içinde kalır — varsayılan çağrı tek istekte kalsın, gereksiz yere 2
 * parçaya bölünmesin diye 90 değil 89 seçildi.
 */
const SPORTMONKS_HISTORY_WINDOW_PAST_DAYS = 89;

/**
 * `matches/history` (flag kapalı) — `competition_id` ile sayfalanmış tüm maçlar (sayfa
 * başına max 30) | `GET /fixtures/between/{from}/{to}?filters=fixtureLeagues:{id}` (flag
 * açık — Pass 1: aynı primitif `getAllMatchesByDate` ile, farklı tarih aralığı).
 */
export async function getAllCompetitionHistoryMatches(
  competitionId: string,
  opts?: { from?: string; to?: string; maxPages?: number; season_id?: number },
): Promise<Match[]> {
  if (isSportmonksProviderEnabled()) {
    try {
      const leagueId = resolveSportmonksLeagueId(competitionId);
      if (leagueId == null) {
        console.warn(
          `[sportmonks] competition_id=${competitionId} için doğrulanmış league_id eşlemesi yok ` +
            '(bkz. sportmonksProviderFlag.ts) — boş sonuç dönülüyor.',
        );
        return [];
      }
      if (opts?.season_id != null) {
        // Pass 1/3: /fixtures/between `season_id` desteklemiyor (yalnızca from/to +
        // filters) — sezon→tarih aralığı çözümü getSeasonsList gerektirir
        // (Katman-2/3, bu görevin kapsamı dışında). Parametre yok sayılıyor.
        console.warn(
          '[sportmonks] getAllCompetitionHistoryMatches: season_id bu sağlayıcıda desteklenmiyor, yok sayıldı.',
        );
      }
      const from = opts?.from ?? isoDateOffset(-SPORTMONKS_HISTORY_WINDOW_PAST_DAYS);
      const to = opts?.to ?? todayIsoUtc();
      return await sportmonksFetchFixturesBetween(from, to, leagueId, opts?.maxPages);
    } catch (error) {
      console.error('Error fetching competition history matches (sportmonks)', error);
      return [];
    }
  }

  const maxPages = Math.max(1, opts?.maxPages ?? 35);
  const extraParams = {
    ...(opts?.from ? { from: opts.from } : {}),
    ...(opts?.to ? { to: opts.to } : {}),
    ...(opts?.season_id != null ? { season_id: opts.season_id } : {}),
  };
  try {
    const first = await getLiveScoreHttpClient().get<{ success?: boolean; data?: { match?: Match[] } & Record<string, unknown> }>(
      `/matches/history`,
      {
        params: { competition_id: competitionId, page: 1, ...extraParams },
      },
    );
    if (!first.data.success || !Array.isArray(first.data.data?.match)) return [];

    const firstMatches = first.data.data.match;
    const totalPages = parseTotalPages(first.data.data);
    const pagesToFetch = Math.min(totalPages, maxPages);
    if (pagesToFetch <= 1) return dedupeMatchesById(firstMatches);

    const rest = await Promise.all(
      Array.from({ length: pagesToFetch - 1 }, (_, i) =>
        getLiveScoreHttpClient().get<{ success?: boolean; data?: { match?: Match[] } }>(`/matches/history`, {
          params: { competition_id: competitionId, page: i + 2, ...extraParams },
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
    const response = await getLiveScoreHttpClient().get(`/matches/history`, {
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

/**
 * Seçilen günün history sayfalarını çeker (Hepsi / lig grupları için) (flag kapalı) |
 * `GET /fixtures/between/{date}/{date}` (flag açık — Pass 1: `getFixturesByDate` ile
 * aynı primitif, `getAllCompetitionHistoryMatches`'ın da paylaştığı ortak fonksiyon).
 */
export async function getAllMatchesByDate(date: string, maxPages = 5): Promise<Match[]> {
  if (isSportmonksProviderEnabled()) {
    try {
      return await sportmonksFetchFixturesBetween(date, date, undefined, maxPages);
    } catch (error) {
      console.error('Error fetching matches by date (sportmonks)', error);
      return [];
    }
  }

  const first = await getMatchesByDate(date, 1);
  const { totalPages, matches: firstMatches } = first;
  const pagesToFetch = Math.min(totalPages, Math.max(1, maxPages));
  if (pagesToFetch <= 1) return dedupeMatchesById(firstMatches);

  const rest = await Promise.all(
    Array.from({ length: pagesToFetch - 1 }, (_, i) => getMatchesByDate(date, i + 2))
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

/** Bir `Match`'in skorundan, `teamId` açısından W/D/L türetir — bitmemiş/skoru olmayan maç için `null`. */
function deriveMatchFormLetter(match: Match, teamId: string): 'W' | 'D' | 'L' | null {
  if (match.status !== 'FINISHED') return null;
  const score = match.scores?.score ?? match.score;
  if (!score) return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(score.trim());
  if (!m) return null;
  const home = Number(m[1]);
  const away = Number(m[2]);
  const isHome = String(match.home?.id ?? '') === teamId;
  const isAway = String(match.away?.id ?? '') === teamId;
  if (!isHome && !isAway) return null;
  if (home === away) return 'D';
  const homeWon = home > away;
  return (isHome && homeWon) || (isAway && !homeWon) ? 'W' : 'L';
}

/** En-yeni-önce sıralı bir `Match[]`'ten `overall_form`/`h2h_form` dizisi üretir. */
function deriveFormFromMatches(matches: Match[], teamId: string): string[] {
  return matches
    .map((m) => deriveMatchFormLetter(m, teamId))
    .filter((x): x is 'W' | 'D' | 'L' => x != null);
}

function resolveTeamNameFromMatches(matches: Match[], teamId: string): string {
  for (const m of matches) {
    if (String(m.home?.id ?? '') === teamId) return m.home.name;
    if (String(m.away?.id ?? '') === teamId) return m.away.name;
  }
  return '';
}

function matchToH2HHistorical(m: Match): Head2HHistoricalMatch {
  return {
    id: String(m.id),
    ...(m.date !== undefined ? { date: m.date } : {}),
    ...(m.scheduled !== undefined ? { scheduled: m.scheduled } : {}),
    ...(m.home?.name !== undefined ? { home_name: m.home.name } : {}),
    ...(m.away?.name !== undefined ? { away_name: m.away.name } : {}),
    ...((m.scores?.score ?? m.score) !== undefined ? { score: m.scores?.score ?? m.score } : {}),
    ...(m.scores?.ht_score !== undefined ? { ht_score: m.scores.ht_score } : {}),
    time: m.time,
    status: m.status,
  };
}

/**
 * `Endpoint: GET /teams/head2head.json?team1_id=&team2_id=` (flag kapalı) |
 * `GET /fixtures/head-to-head/{id1}/{id2}` (flag açık — Pass 4). Sportmonks bu
 * endpoint'te `team1`/`team2` form ÖZETİ döndürmüyor (rapor bulgusu) —
 * `overall_form`/`h2h_form` burada `getTeamHistoryMatches`'ten (zaten en-yeni-
 * önce sıralı) client-side türetiliyor.
 */
export const getTeamsHead2Head = async (
  team1Id: string,
  team2Id: string
): Promise<Head2HeadData | null> => {
  if (isSportmonksProviderEnabled()) {
    try {
      const envelope = await sportmonksClientRequest<SportmonksFixture[]>(
        'football',
        `/fixtures/head-to-head/${team1Id}/${team2Id}`,
        { include: SPORTMONKS_FIXTURE_INCLUDE },
      );
      const fixtures = envelope.data ?? [];
      if (fixtures.length === 0) return null;

      const h2hMatches = fixtures.map(mapSportmonksFixtureToMatch);
      const [team1Last, team2Last] = await Promise.all([
        sportmonksFetchTeamFixtures(team1Id),
        sportmonksFetchTeamFixtures(team2Id),
      ]);

      return {
        team1: {
          id: team1Id,
          name: resolveTeamNameFromMatches([...h2hMatches, ...team1Last], team1Id),
          overall_form: deriveFormFromMatches(team1Last, team1Id),
          h2h_form: deriveFormFromMatches(h2hMatches, team1Id),
        },
        team2: {
          id: team2Id,
          name: resolveTeamNameFromMatches([...h2hMatches, ...team2Last], team2Id),
          overall_form: deriveFormFromMatches(team2Last, team2Id),
          h2h_form: deriveFormFromMatches(h2hMatches, team2Id),
        },
        h2h: h2hMatches.map(matchToH2HHistorical),
      };
    } catch (error) {
      console.error('Error fetching head2head (sportmonks)', error);
      return null;
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get<ApiResponse<Head2HeadData>>(`/teams/head2head`, {
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

// Endpoint: GET /matches/events.json?match_id=X (flag kapalı) |
// GET /fixtures/{id}?include=events (flag açık — Pass 4/5)
// Returns both match details and events
export const getMatchWithEvents = async (
  matchId: string
): Promise<{ match: Match | null; events: MatchEvent[] }> => {
  if (isSportmonksProviderEnabled()) {
    try {
      const fixture = await sportmonksFetchFixtureDetail(matchId, `${SPORTMONKS_FIXTURE_INCLUDE};events`);
      if (!fixture) return { match: null, events: [] };
      return { match: mapSportmonksFixtureToMatch(fixture), events: mapSportmonksEvents(fixture) };
    } catch (error) {
      console.error('Error fetching match events (sportmonks)', error);
      return { match: null, events: [] };
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get(`/matches/events`, {
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

// Endpoint: GET /matches/stats.json?match_id=X (flag kapalı) |
// GET /fixtures/{id}?include=statistics (flag açık — Pass 4/5)
export const getMatchStats = async (matchId: string): Promise<MatchStatsData | null> => {
  if (isSportmonksProviderEnabled()) {
    try {
      const fixture = await sportmonksFetchFixtureDetail(matchId, 'statistics');
      return mapSportmonksStatistics(fixture?.statistics);
    } catch (error) {
      console.error('Error fetching stats (sportmonks)', error);
      return null;
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get(`/matches/stats`, {
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

// Endpoint: GET /matches/lineups.json?match_id=X (flag kapalı) |
// GET /fixtures/{id}?include=lineups.player.nationality;lineups.details;participants (flag açık — Pass 4/5)
export const getMatchLineups = async (matchId: string): Promise<any | null> => {
  if (isSportmonksProviderEnabled()) {
    try {
      const fixture = await sportmonksFetchFixtureDetail(matchId, 'lineups.player.nationality;lineups.details;participants');
      return fixture ? mapSportmonksLineups(fixture) : null;
    } catch (error) {
      console.error('Error fetching lineups (sportmonks)', error);
      return null;
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get(`/matches/lineups`, {
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

// Endpoint: GET /teams/last-matches.json?team_id=X&number=10 — sağlayıcıdan
// bağımsız: `getTeamHistoryMatches` zaten en-yeni-önce sıralı Match[] döner
// (flag açık/kapalı ikisinde de), burada sadece `slice` yapılıyor.
export const getTeamLastMatches = async (teamId: string, count = 10): Promise<Match[]> => {
  const matches = await getTeamHistoryMatches(teamId);
  return matches.slice(0, count);
};

export type TeamCompetitionRow = {
  id: number;
  name: string;
  logo?: string;
  countryId?: number;
};

export const getTeamCompetitions = (matches: Match[], teamId: string): TeamCompetitionRow[] => {
  const seen = new Set<number>();
  const list: TeamCompetitionRow[] = [];

  matches.forEach((m) => {
    const compId = m.competition?.id;
    const compName = m.competition?.name;
    const includesTeam =
      m.home?.id?.toString() === teamId || m.away?.id?.toString() === teamId;

    if (!includesTeam || !compId || !compName || seen.has(compId)) return;
    seen.add(compId);
    list.push({
      id: compId,
      name: compName,
      logo: m.competition?.logo,
      countryId: m.country?.id,
    });
  });

  return list;
};

// Endpoint: GET /competitions/squads.json?team_id=X&competition_id=Y
function mapSportmonksSquadRowToPlayer(row: SportmonksSquadRow) {
  return {
    id: row.player_id,
    shirt_number: row.jersey_number,
    name: row.player?.display_name ?? row.player?.name ?? '',
    ...(row.player?.image_path ? { photo: row.player.image_path } : {}),
    ...(row.position_id != null && resolvePositionShortCode(row.position_id)
      ? { position: resolvePositionShortCode(row.position_id) }
      : {}),
    captain: row.captain ?? false,
  };
}

/**
 * `Endpoint: GET /competitions/squads.json?team_id=&competition_id=` (flag kapalı) |
 * `GET /squads/teams/{id}?include=player` (flag açık, güncel kadro — Pass 4) |
 * `GET /squads/seasons/{season_id}/teams/{id}?include=player` (flag açık +
 * `opts.seasonId` verilirse, geçmiş kadro — Pass 4'ün işaret ettiği ayrı
 * endpoint). `competitionId` Sportmonks dalında kullanılmıyor — kadro
 * Sportmonks'ta lig-scoped değil, takım-scoped.
 *
 * Faz 4'te gerçek istekle doğrulandı: geçmiş kadro endpoint'i BENZER ama AYNI
 * OLMAYAN bir şekil döndürüyor — `captain`/`start`/`end` yok (bunun yerine
 * `has_values`, kullanılmıyor), VE ayrı bir kota havuzundan sayılıyor
 * (`PlayerStatistic` — Pass 5 sonunda bulunan 6 havuzdan bağımsız, 7. havuz).
 * `SportmonksSquadRow`'daki bu alanların hepsi opsiyonel olduğu için
 * `mapSportmonksSquadRowToPlayer` her iki şekli de sorunsuz işliyor.
 */
export const getTeamSquads = async (
  teamId: string,
  competitionId: string,
  opts?: { seasonId?: number },
): Promise<any> => {
  if (isSportmonksProviderEnabled()) {
    try {
      const path =
        opts?.seasonId != null ? `/squads/seasons/${opts.seasonId}/teams/${teamId}` : `/squads/teams/${teamId}`;
      const envelope = await sportmonksClientRequest<SportmonksSquadRow[]>('football', path, { include: 'player' });
      const rows = envelope.data ?? [];
      return rows.map(mapSportmonksSquadRowToPlayer);
    } catch (error) {
      console.error('Error fetching team squads (sportmonks)', error);
      return [];
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get(`/competitions/squads`, {
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
    const rosterRes = await getLiveScoreHttpClient().get(`/competitions/rosters`, {
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
  /**
   * Faz 3: Sportmonks'ta sezonlar GLOBAL değil, lig-scoped (`/leagues/{id}?
   * include=seasons`, Pass 4). livescore-api.com'un `/seasons/list.json`'ı tüm
   * ligler için TEK bir paylaşılan sezon kimliği uzayı sunuyordu (bu yüzden
   * mevcut fonksiyon hiç competition_id almıyordu) — Sportmonks'ta böyle bir
   * kavram yok. Flag açıkken bu alan ZORUNLU; verilmezse (eski 0-arg çağrı
   * şekli) boş dizi + `console.warn` döner, tahmini/yanlış bir lig sezonu
   * asla dönmez.
   */
  competitionId?: number | string;
};

// Endpoint: GET /seasons/list.json (flag kapalı) | GET /leagues/{id}?include=seasons (flag açık — Pass 4)
export async function getSeasonsList(opts?: GetSeasonsListOptions): Promise<SeasonListItem[]> {
  if (isSportmonksProviderEnabled()) {
    try {
      if (opts?.competitionId == null) {
        console.warn(
          '[sportmonks] getSeasonsList: competitionId verilmedi — Sportmonks sezonları lig-scoped, ' +
            'global bir sezon listesi yok. Boş dizi dönülüyor.',
        );
        return [];
      }
      const leagueId = sportmonksResolveLeagueIdOrWarn(opts.competitionId, 'getSeasonsList');
      if (leagueId == null) return [];

      const seasons = await sportmonksFetchLeagueSeasons(leagueId);
      const parsed: SeasonListItem[] = seasons.map((s) => ({
        id: s.id,
        name: s.name,
        ...(s.starting_at !== undefined ? { start: s.starting_at } : {}),
        ...(s.ending_at !== undefined ? { end: s.ending_at } : {}),
      }));

      const uiFiltered = filterSeasonListForUi(parsed);
      const filtered = opts?.skipCalendarYearDedupe ? uiFiltered : dedupeCalendarYearSeasons(uiFiltered);
      return filtered.sort((a, b) => seasonSortKey(b) - seasonSortKey(a));
    } catch (error) {
      console.error('Error fetching seasons list (sportmonks)', error);
      return [];
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get<{
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

// Endpoint: GET /competitions/table.json?competition_id= (flag kapalı) |
// GET /standings/seasons/{season_id} (flag açık — Pass 4: league_id tek başına
// yetmiyor, önce is_current sezon çözülüyor)
export const getCompetitionTableFull = async (
  competitionId: string,
  query?: CompetitionTableQuery
): Promise<CompetitionTableData | null> => {
  if (isSportmonksProviderEnabled()) {
    try {
      return await sportmonksFetchCompetitionTable(competitionId, query);
    } catch (error) {
      console.error('Error fetching competition table (sportmonks)', error);
      return null;
    }
  }

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
    const response = await getLiveScoreHttpClient().get(`/competitions/table`, {
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

// Endpoint: GET /competitions/table.json?competition_id=X (flag kapalı) |
// GET /standings/seasons/{season_id} (flag açık — Pass 4, aynı primitif
// `getCompetitionTableFull` ile paylaşılıyor, sadece düz `table[]` dönülüyor)
export const getLeagueTable = async (competitionId: string): Promise<any> => {
  if (isSportmonksProviderEnabled()) {
    try {
      const data = await sportmonksFetchCompetitionTable(competitionId);
      return data?.table ?? null;
    } catch (error) {
      console.error('Error fetching league table (sportmonks)', error);
      return null;
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get(`/competitions/table`, {
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
// (flag kapalı) | GET /topscorers/seasons/{id}?filters=seasonTopscorerTypes:208 (flag açık — Pass 4)
export const getTopScorers = async (
  competitionId: string,
  opts?: { season?: number }
): Promise<TopScorersPayload | null> => {
  if (isSportmonksProviderEnabled()) {
    try {
      // Gol (208) + asist (209) TEK sorguda: aynı endpoint/havuz, ek istek yalnızca ek sayfa (Süper Lig: 81+76 satır → 4 sayfa, 2'ydi).
      const rows = await sportmonksFetchTopscorerRows(
        competitionId,
        opts?.season,
        [GOAL_TOPSCORER_TYPE_ID, ASSIST_TOPSCORER_TYPE_ID],
        'getTopScorers',
      );
      if (rows == null) return null;
      const leagueId = resolveSportmonksLeagueId(competitionId) ?? undefined;
      const seasonId = rows[0]?.season_id;
      return {
        competition: { id: leagueId, name: '' },
        ...(seasonId != null ? { season: { id: seasonId } } : {}),
        topscorers: mapTopscorerRowsToEntries(rows),
      };
    } catch (error) {
      console.error('Error fetching top scorers (sportmonks)', error);
      return null;
    }
  }

  try {
    const params: Record<string, string | number> = {
      competition_id: competitionId,
    };
    if (opts?.season != null && Number.isFinite(opts.season)) {
      params.season_id = opts.season;
    }
    const response = await getLiveScoreHttpClient().get<{ success?: boolean; data?: TopScorersPayload }>(
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

/**
 * Gol Krallığı "O" (oynanan maç) sütunu. `topscorers` endpoint'inde oynanan maç YOK (gerçek yanıtta doğrulandı);
 * kaynak oyuncu sezon istatistiği: `GET /squads/seasons/{sid}/teams/{tid}?include=player.statistics.details
 * &filters=playerStatisticSeasons:{sid}` → `details[type_id 321 APPEARANCES].value.total`. TAKIM başına 1 istek
 * (`PlayerStatistic` havuzu; Süper Lig: 18 takım = 18 istek — oyuncu başına değil). Sportmonks'un `players/multi`
 * endpoint'i bu planda yok (404). Bir takım isteği başarısız olursa o takımın oyuncuları için `O` boş kalır.
 * Sunucu tarafında 30 dk cache'li (`api/sportmonks/[...path]`), yalnızca Gol Krallığı sekmesi açılınca çağrılır.
 */
export const getTopScorerAppearances = async (seasonId: number, teamIds: number[]): Promise<Record<number, number>> => {
  if (!isSportmonksProviderEnabled() || !Number.isFinite(seasonId)) return {};
  const unique = [...new Set(teamIds.filter((id) => Number.isFinite(id)))];
  const parts = await Promise.all(
    unique.map(async (teamId) => {
      try {
        const envelope = await sportmonksClientRequest<SportmonksSquadStatsRow[]>(
          'football',
          `/squads/seasons/${seasonId}/teams/${teamId}`,
          { include: 'player.statistics.details', filters: `playerStatisticSeasons:${seasonId}` },
        );
        return extractAppearances(envelope.data ?? [], seasonId);
      } catch (error) {
        console.error(`Error fetching appearances for team ${teamId} (sportmonks)`, error);
        return {} as Record<number, number>;
      }
    }),
  );
  return Object.assign({}, ...parts);
};

/**
 * Kadro mini tablosu (M/G/A/SK/KK + ayrıntılı pozisyon): TEK takım için Gol Krallığı "O" ile AYNI endpoint
 * (`squads/seasons/{sid}/teams/{tid}?include=player.statistics.details`, 30 dk sunucu cache'li). Hata → `{}` (UI "—").
 */
export const getTeamSquadStats = async (seasonId: number, teamId: number): Promise<Record<number, SquadStatLine>> => {
  if (!isSportmonksProviderEnabled() || !Number.isFinite(seasonId) || !Number.isFinite(teamId)) return {};
  try {
    const envelope = await sportmonksClientRequest<SportmonksSquadStatsRow[]>(
      'football',
      `/squads/seasons/${seasonId}/teams/${teamId}`,
      { include: 'player.statistics.details', filters: `playerStatisticSeasons:${seasonId}` },
    );
    return extractSquadStats(envelope.data ?? [], seasonId, teamId);
  } catch (error) {
    console.error(`Error fetching squad stats for team ${teamId} (sportmonks)`, error);
    return {};
  }
};

/** Takımın sezonun en golcüleri (ilk 3) — `getTeamSquadStats` ile AYNI endpoint/cache (takım başına 1 istek). Hata/veri yok → `[]`. */
export const getTeamTopScorers = async (seasonId: number, teamId: number, limit = 3): Promise<TeamTopScorer[]> => {
  if (!isSportmonksProviderEnabled() || !Number.isFinite(seasonId) || !Number.isFinite(teamId)) return [];
  try {
    const envelope = await sportmonksClientRequest<SportmonksSquadStatsRow[]>(
      'football',
      `/squads/seasons/${seasonId}/teams/${teamId}`,
      { include: 'player.statistics.details', filters: `playerStatisticSeasons:${seasonId}` },
    );
    return extractTeamTopScorers(envelope.data ?? [], seasonId, teamId, limit);
  } catch (error) {
    console.error(`Error fetching top scorers for team ${teamId} (sportmonks)`, error);
    return [];
  }
};

// Endpoint: GET /competitions/topdisciplinary.json?competition_id=X (flag kapalı) |
// GET /topscorers/seasons/{id}?filters=seasonTopscorerTypes:83,84 (flag açık — Pass 4:
// `getTopScorers` ile AYNI endpoint/primitif — `sportmonksFetchTopscorerRows` — sadece
// filtre type_id'leri farklı; iki satır [kırmızı,sarı] oyuncu bazında tek satıra birleştiriliyor).
export const getTopDisciplinary = async (competitionId: string): Promise<any> => {
  if (isSportmonksProviderEnabled()) {
    try {
      const rows = await sportmonksFetchTopscorerRows(
        competitionId,
        undefined,
        [DISCIPLINARY_TYPE_IDS.RED, DISCIPLINARY_TYPE_IDS.YELLOW],
        'getTopDisciplinary',
      );
      if (rows == null) return [];
      return mergeDisciplinaryRows(rows);
    } catch (error) {
      console.error('Error fetching top disciplinary (sportmonks)', error);
      return [];
    }
  }

  try {
    const response = await getLiveScoreHttpClient().get(`/competitions/topdisciplinary`, {
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
