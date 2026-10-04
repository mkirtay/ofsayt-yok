import { Match } from '../models/liveScore';
import { MatchEvent, MatchLineupData, MatchStatsData } from '../models/domain';
import { compareGroupedLeagues } from '../config/leagues';
import { WORLD_CUP_COMPETITION_ID } from '../config/worldCup';
import { resolveSportmonksLeagueId } from './sportmonksProviderFlag';
import { sportmonksClientRequest, sportmonksCollectAllPages } from './sportmonksRuntimeClient';
import { SportmonksHttpError } from './sportmonks/httpClient';
import { matchIstanbulDate } from '../utils/matchActivity';
import { todayIsoIstanbul } from '../utils/dateStrip';
import {
  FIXTURE_DETAIL_EXTRA_FILTERS,
  FIXTURE_DETAIL_EXTRA_INCLUDE,
  FIXTURE_TV_INCLUDE,
  wantsTvStations,
} from '@/services/sportmonks/matchExtras';
import { mapSportmonksFixtureToMatch } from './sportmonksFixtureMapper';
import { mapSportmonksStateToPhase } from './sportmonks/stateMapping';
import {
  mapSportmonksEvents,
  mapSportmonksLineups,
  mapSportmonksStatistics,
  mapTopscorerRowsToEntries,
  extractAppearances,
  extractSquadStats,
  extractTeamTopScorers,
  type DisciplinaryRow,
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
import {
  mapTeamUpcoming,
  TEAM_UPCOMING_INCLUDE,
  type SportmonksTeamWithUpcoming,
  type TeamUpcoming,
} from './sportmonks/teamUpcoming';
import { normalizeDisplayName } from '@/utils/displayName';

export type PaginatedMatches = {
  matches: Match[];
  totalPages: number;
  page: number;
};

// ─── Sportmonks (Faz 2) — Katman-1 yardımcıları ────────────────────────────
// docs/SPORTMONKS_MIGRATION.md Pass 1'de eşlenen 5 Katman-1 fonksiyonunun
// (getAllLiveMatches/getLiveMatches, getFixturesByDate, getFixturesByCompetition,
// getAllMatchesByDate, getAllCompetitionHistoryMatches) ortak Sportmonks tarafı.

/**
 * Pass 1-3'te doğrulanan tüm alanları (skor, dakika, konum, hakem, tur/faz, grup)
 * doldurmak için gereken include seti — tek bir kombine istek, ayrı ayrı çağrı yok.
 * Bu kombinasyonun tamamı tek istekte BİRLİKTE raporda test edilmedi (her include
 * kendi pass'inde tek başına doğrulandı) ama Sportmonks'un include sözdizimi
 * (`;` ile ayrılmış liste) standart, birleştirmek dokümante edilmiş bir davranış.
 */
export const SPORTMONKS_FIXTURE_INCLUDE =
  'participants;scores;state;periods;league.country;venue;referees.referee;round;stage;group;aggregate';

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

// Endpoint: GET /livescores/inplay (Pass 1)
export const getLiveMatches = async (page = 1): Promise<PaginatedMatches> => {
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
};

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Endpoint: GET /fixtures/date/{date} (Pass 1)
export async function getFixturesByDate(isoDate: string): Promise<Match[]> {
  const trimmed = isoDate.trim();
  const dateParam = !trimmed || trimmed.toLowerCase() === 'today' ? todayIsoUtc() : trimmed;

  try {
    return await sportmonksFetchFixturesByDate(dateParam);
  } catch (error) {
    console.error('Error fetching fixtures (sportmonks)', error);
    return [];
  }
}

export const getTodayFixtures = (): Promise<Match[]> => getFixturesByDate(todayIsoUtc());

export type SportmonksFixtureLookup =
  | { kind: 'found'; match: Match; events: MatchEvent[] }
  /** Eski sağlayıcı (livescore) id aralığında — sunucu tarafı hiç istek atmadı (bkz. resolveSportmonksMatch). */
  | { kind: 'legacy' }
  /** Sportmonks "yok / erişim yok" dedi (404/403/422 ya da boş 200) — kalıcı, negatif cache'lenebilir. */
  | { kind: 'missing' }
  /** Geçici hata (429/5xx/ağ) — tekrar denenebilir, cache'lenmez. */
  | { kind: 'error' };

const SPORTMONKS_MISSING_STATUSES = new Set([400, 403, 404, 422]);

/**
 * Tek maçı `fixtures/{id}` (+events) ile çeker ve sonucu kalıcı/geçici diye ayırır.
 * Sportmonks'ta id uzayı tek: `fixtures/{id}` bulamadıysa tarih/lig listeleri de bulamaz,
 * bu yüzden liste taraması (eski `findMatchById` adım 2-3) yapılmaz.
 * Id aralığı burada kontrol EDİLMEZ: eski UEFA sezonlarının Sportmonks id'leri eski livescore
 * id'leriyle aynı aralıkta (bkz. fixtureIdRange.ts) — hangisi olduğuna SSR slug'la karar verir.
 */
export async function lookupSportmonksFixture(matchId: string): Promise<SportmonksFixtureLookup> {
  if (!/^\d{1,12}$/.test(matchId)) return { kind: 'missing' };
  try {
    // Detay: + teknik direktörler, hava, hashtag (bkz. sportmonks/matchExtras.ts) — aynı istek.
    const envelope = await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${matchId}`, {
      include: `${SPORTMONKS_FIXTURE_INCLUDE};events;${FIXTURE_DETAIL_EXTRA_INCLUDE}`,
      filters: FIXTURE_DETAIL_EXTRA_FILTERS,
    });
    let fixture = envelope.data;
    if (!fixture || Array.isArray(fixture) || typeof fixture !== 'object') return { kind: 'missing' };
    // Yayıncılar yalnız başlamamış / canlı maçta, ayrı küçük istekle (sunucu TR dışını ayıklar); hata maçı düşürmez.
    const stateId = fixture.state?.id ?? fixture.state_id;
    if (stateId != null && wantsTvStations(mapSportmonksStateToPhase(stateId))) {
      try {
        const tv = await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${matchId}`, { include: FIXTURE_TV_INCLUDE });
        if (tv.data && !Array.isArray(tv.data)) fixture = { ...fixture, tvstations: tv.data.tvstations ?? [] };
      } catch {
        // yayıncı satırı görünmez
      }
    }
    return { kind: 'found', match: mapSportmonksFixtureToMatch(fixture), events: mapSportmonksEvents(fixture) };
  } catch (error) {
    if (error instanceof SportmonksHttpError && SPORTMONKS_MISSING_STATUSES.has(error.status)) {
      return { kind: 'missing' };
    }
    console.error('Error fetching fixture (sportmonks)', error);
    return { kind: 'error' };
  }
}

/**
 * Belirli bir matchId'ye sahip maçı bulur.
 * Sportmonks: yalnızca `fixtures/{id}` (bkz. `lookupSportmonksFixture`); eski sağlayıcı id'sine hiç istek atılmaz.
 */
export async function findMatchById(
  matchId: string,
): Promise<{ match: Match | null; events: MatchEvent[]; fromFixture: boolean }> {
  const lookup = await lookupSportmonksFixture(matchId);
  return lookup.kind === 'found'
    ? { match: lookup.match, events: lookup.events, fromFixture: false }
    : { match: null, events: [], fromFixture: false };
}

// ─── Sportmonks (Faz 3) — Katman-2/3 yardımcıları ──────────────────────────
// docs/SPORTMONKS_MIGRATION.md Pass 4-5'te eşlenen maç detayı/H2H/sıralama/
// kadro fonksiyonlarının ortak Sportmonks tarafı.

/** Tek bir fixture'ı (maç detayı) istenen include'larla çeker — liste değil, tekil kaynak. */
async function sportmonksFetchFixtureDetail(
  fixtureId: string | number,
  include: string,
  filters?: string,
): Promise<SportmonksFixture | null> {
  const envelope = await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${fixtureId}`, {
    include,
    ...(filters ? { filters } : {}),
  });
  return envelope.data ?? null;
}

/** `leagues/{id}?include=seasons` — Pass 4: ayrı bir global `/seasons` endpoint'i yok. */
/**
 * Tarayıcıda lig başına TEK kayıt (`league-seasons:{id}`): sezon listesi (`getSeasonsList`) ve güncel sezon
 * çözümü (puan durumu / gol krallığı) aynı `leagues/{id}?include=seasons` cevabını paralel istiyordu → ana sayfa
 * her açılışta aynı isteği 3 kez atıyordu. Uçuştaki istek paylaşılır, sonuç 5 dk tutulur (yan panel staleTime'ı).
 * Sunucuda gerek yok: `cachedFetch` zaten tekil uçuş + paylaşımlı cache.
 */
const LEAGUE_SEASONS_TTL_MS = 5 * 60_000;
const leagueSeasonsMemo = new Map<number, { at: number; promise: Promise<SportmonksSeasonRow[]> }>();

async function sportmonksFetchLeagueSeasonsUncached(leagueId: number): Promise<SportmonksSeasonRow[]> {
  const envelope = await sportmonksClientRequest<{ id: number; seasons?: SportmonksSeasonRow[] }>(
    'football',
    `/leagues/${leagueId}`,
    { include: 'seasons' },
  );
  return envelope.data?.seasons ?? [];
}

function sportmonksFetchLeagueSeasons(leagueId: number): Promise<SportmonksSeasonRow[]> {
  if (typeof window === 'undefined') return sportmonksFetchLeagueSeasonsUncached(leagueId);
  const now = Date.now();
  const hit = leagueSeasonsMemo.get(leagueId);
  if (hit && now - hit.at < LEAGUE_SEASONS_TTL_MS) return hit.promise;
  const promise = sportmonksFetchLeagueSeasonsUncached(leagueId);
  leagueSeasonsMemo.set(leagueId, { at: now, promise });
  // Hata cache'lenmez: sonraki çağrı yeniden dener.
  promise.catch(() => {
    if (leagueSeasonsMemo.get(leagueId)?.promise === promise) leagueSeasonsMemo.delete(leagueId);
  });
  return promise;
}

/** Yalnız testler için. */
export function __resetLeagueSeasonsMemoForTests(): void {
  leagueSeasonsMemo.clear();
}

function sportmonksPickCurrentSeasonId(seasons: SportmonksSeasonRow[]): number | null {
  return seasons.find((s) => s.is_current)?.id ?? null;
}

/**
 * Puan durumu / sezon / gol krallığı fonksiyonlarının `competitionId`'si Sportmonks açıkken DOĞRUDAN
 * Sportmonks `league_id`'dir (legacy çeviri yok; legacy id kullananlar `legacyToStandingsLeagueId` ile
 * girişte çevirir). Dünya Kupası (362) planda yok → istek atmadan `null`.
 */
function sportmonksResolveLeagueIdOrWarn(competitionId: number | string, caller: string): number | null {
  const leagueId = Number(competitionId);
  if (!Number.isFinite(leagueId) || leagueId <= 0) {
    console.warn(`[sportmonks] ${caller}: geçersiz league_id=${competitionId}`);
    return null;
  }
  if (leagueId === WORLD_CUP_COMPETITION_ID) return null;
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
      team: { id: p.team_id, name: p.name, ...(p.short_code ? { short_code: p.short_code } : {}), ...(p.logo ? { logo: p.logo } : {}) },
      team_id: p.team_id,
      name: p.name,
      ...(p.short_code ? { short_code: p.short_code } : {}),
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
  maxPages?: number,
): Promise<SportmonksTopscorerRow[] | null> {
  const leagueId = sportmonksResolveLeagueIdOrWarn(competitionId, caller);
  if (leagueId == null) return null;
  const seasonId = await sportmonksResolveSeasonId(leagueId, explicitSeasonId);
  if (seasonId == null) return null;

  const rows = await sportmonksCollectAllPages<SportmonksTopscorerRow>({
    basePath: 'football',
    path: `/topscorers/seasons/${seasonId}`,
    perPage: 50,
    maxPages,
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

/**
 * GET /fixtures/between/{start}/{end}/{team_id} (Pass 4, parametre sırasına dikkat) — takımın geçmiş maçları.
 */
export async function getTeamHistoryMatches(teamId: string): Promise<Match[]> {
  try {
    return await sportmonksFetchTeamFixtures(teamId);
  } catch (error) {
    console.error('Error fetching team history matches (sportmonks)', error);
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

/**
 * Sportmonks tarafında `competition_id`nin geçmiş+gelecek varsayılan penceresi.
 * Pass 3: `/fixtures/between` 100 günden uzun aralıkta 422 veriyor — 14+75=89 gün
 * tek istekte kalır (chunkSportmonksDateRange yine de >100 gün istenirse böler).
 */
const SPORTMONKS_COMPETITION_WINDOW_PAST_DAYS = 14;
const SPORTMONKS_COMPETITION_WINDOW_FUTURE_DAYS = 75;

// Endpoint: GET /fixtures/between/{from}/{to}?filters=fixtureLeagues:{id} (Pass 1;
// bare `/fixtures` YANLIŞ sonuç veriyor, bkz. rapor — burada asla kullanılmıyor)
export async function getFixturesByCompetition(
  competitionId: number | string
): Promise<Match[]> {
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

/** `selectedDate` ana sayfanın Türkiye günü; maçın günü de başlama saatinden Türkiye saatine göre alınır. */
export function isLiveMatchOnSelectedDate(m: Match, selectedDate: string): boolean {
  const d = matchIstanbulDate(m);
  if (d) return d === selectedDate;
  return selectedDate === todayIsoIstanbul();
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
 * `mergeMatchesForAllTab`'ın Sportmonks karşılığı — Pass 1 Genel
 * Bulgu 2: Sportmonks'ta `/fixtures/date`, `/fixtures/between` ve
 * `/livescores/inplay` aynı `id`'yi kullanıyor, bu yüzden `fixture_id` tabanlı
 * reconciliation (`mergeMatchMapKey`/`mergeMatchRow`) gereksiz — düz `id` ile
 * eşleyip üstüne yazmak yeterli.
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
 * `GET /fixtures/between/{from}/{to}?filters=fixtureLeagues:{id}` — yarışmanın geçmiş maçları
 * (Pass 1: aynı primitif `getAllMatchesByDate` ile, farklı tarih aralığı).
 */
export async function getAllCompetitionHistoryMatches(
  competitionId: string,
  opts?: { from?: string; to?: string; maxPages?: number; season_id?: number },
): Promise<Match[]> {
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

function allTabStatusRank(m: Match): number {
  if (m.status === 'IN PLAY') return 0;
  if (m.status === 'HALF TIME BREAK') return 1;
  if (m.status === 'NOT STARTED') return 2;
  if (m.status === 'FINISHED') return 3;
  return 4;
}

/**
 * Başlama sırası anahtarı: UTC `date` + `HH:MM`. Tarih de anahtarda — Türkiye günü iki UTC gününe yayılır
 * (ör. 2 Ekim 22:15 UTC = 3 Ekim 01:15 TR, 3 Ekim 00:30 UTC = 03:30 TR); yalnız saatle 00:30, 22:15'in önüne geçiyordu.
 */
function kickoffSortKey(m: Match): string {
  const s = (m.scheduled ?? m.time ?? '').trim();
  const hm = /^\d{2}:\d{2}/.exec(s)?.[0];
  if (!hm) return '9999-99-99 99:99';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(m.date?.trim() ?? '') ? m.date!.trim() : '0000-00-00';
  return `${date} ${hm}`;
}

function compareMatchesForAllTab(a: Match, b: Match): number {
  const ra = allTabStatusRank(a);
  const rb = allTabStatusRank(b);
  if (ra !== rb) return ra - rb;
  return kickoffSortKey(a).localeCompare(kickoffSortKey(b));
}

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
 * Seçilen günün maçları (Hepsi / lig grupları için): `GET /fixtures/between/{date}/{date}` (Pass 1: `getFixturesByDate` ile
 * aynı primitif, `getAllCompetitionHistoryMatches`'ın da paylaştığı ortak fonksiyon).
 */
export async function getAllMatchesByDate(date: string, maxPages = 5): Promise<Match[]> {
  try {
    return await sportmonksFetchFixturesBetween(date, date, undefined, maxPages);
  } catch (error) {
    console.error('Error fetching matches by date (sportmonks)', error);
    return [];
  }
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
 * `Endpoint: GET /fixtures/head-to-head/{id1}/{id2}` (Pass 4). Sportmonks bu
 * endpoint'te `team1`/`team2` form ÖZETİ döndürmüyor (rapor bulgusu) —
 * `overall_form`/`h2h_form` burada `getTeamHistoryMatches`'ten (zaten en-yeni-
 * önce sıralı) client-side türetiliyor.
 */
export const getTeamsHead2Head = async (
  team1Id: string,
  team2Id: string
): Promise<Head2HeadData | null> => {
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
};

// Endpoint: GET /fixtures/{id}?include=events (Pass 4/5)
// Returns both match details and events
export const getMatchWithEvents = async (
  matchId: string
): Promise<{ match: Match | null; events: MatchEvent[] }> => {
  try {
    const fixture = await sportmonksFetchFixtureDetail(matchId, `${SPORTMONKS_FIXTURE_INCLUDE};events`);
    if (!fixture) return { match: null, events: [] };
    return { match: mapSportmonksFixtureToMatch(fixture), events: mapSportmonksEvents(fixture) };
  } catch (error) {
    console.error('Error fetching match events (sportmonks)', error);
    return { match: null, events: [] };
  }
};

// Endpoint: GET /fixtures/{id}?include=statistics (Pass 4/5)
export const getMatchStats = async (matchId: string): Promise<MatchStatsData | null> => {
  try {
    const fixture = await sportmonksFetchFixtureDetail(matchId, 'statistics');
    return mapSportmonksStatistics(fixture?.statistics);
  } catch (error) {
    console.error('Error fetching stats (sportmonks)', error);
    return null;
  }
};

// Endpoint: GET /fixtures/{id}?include=lineups.player.nationality;lineups.details;participants (Pass 4/5)
export const getMatchLineups = async (matchId: string): Promise<MatchLineupData | null> => {
  try {
    // metadata 572 = kadro resmî mi (Muhtemel 11 / İlk 11); filtre yalnız o satırı getirir.
    const fixture = await sportmonksFetchFixtureDetail(
      matchId,
      'lineups.player.nationality;lineups.details;participants;metadata',
      'metadataTypes:572',
    );
    return fixture ? mapSportmonksLineups(fixture) : null;
  } catch (error) {
    console.error('Error fetching lineups (sportmonks)', error);
    return null;
  }
};

// `getTeamHistoryMatches` zaten en-yeni-önce sıralı Match[] döner; burada yalnız `slice`.
export const getTeamLastMatches = async (teamId: string, count = 10): Promise<Match[]> => {
  const matches = await getTeamHistoryMatches(teamId);
  return matches.slice(0, count);
};

/**
 * Takımın tüm turnuvalardaki oynanmamış maçları (en yakından uzağa) — `GET /teams/{id}?include=upcoming...`
 * (endpoint gerekçesi: sportmonks/teamUpcoming.ts).
 * Hata fırlatır (react-query yeniden dener; hata "planlanmış maç yok" ile karışmasın).
 */
export const getTeamUpcomingFixtures = async (teamId: string): Promise<TeamUpcoming> => {
  const envelope = await sportmonksClientRequest<SportmonksTeamWithUpcoming>('football', `/teams/${teamId}`, {
    include: TEAM_UPCOMING_INCLUDE,
  });
  return mapTeamUpcoming(envelope.data);
};

export type TeamCompetitionRow = {
  id: number;
  name: string;
  logo?: string;
  countryId?: number;
  /** Sportmonks `league.country.image_path` — lig logosu yoksa bayrak yedeği. */
  countryFlag?: string;
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
      ...(m.country?.flag ? { countryFlag: m.country.flag } : {}),
    });
  });

  return list;
};

// Endpoint: GET /competitions/squads.json?team_id=X&competition_id=Y
function mapSportmonksSquadRowToPlayer(row: SportmonksSquadRow) {
  return {
    id: row.player_id,
    shirt_number: row.jersey_number,
    name: normalizeDisplayName(row.player?.display_name ?? row.player?.name ?? ''),
    ...(row.player?.image_path ? { photo: row.player.image_path } : {}),
    ...(row.position_id != null && resolvePositionShortCode(row.position_id)
      ? { position: resolvePositionShortCode(row.position_id) }
      : {}),
    captain: row.captain ?? false,
  };
}

/**
 * `Endpoint: GET /squads/teams/{id}?include=player` (güncel kadro — Pass 4) |
 * `GET /squads/seasons/{season_id}/teams/{id}?include=player` (
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
): Promise<unknown[]> => {
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
  team?: { id: number; name: string; short_code?: string; logo?: string };
  team_id?: number;
  name?: string;
  /** Sportmonks takım kısaltması ("GAL"); dar panellerde gösterilir (bkz. utils/standingsTeamLabel). */
  short_code?: string;
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
   * include=seasons`, Pass 4). Bu alan ZORUNLU; verilmezse (eski 0-arg çağrı
   * şekli) boş dizi + `console.warn` döner, tahmini/yanlış bir lig sezonu
   * asla dönmez.
   */
  competitionId?: number | string;
};

// Endpoint: GET /leagues/{id}?include=seasons (Pass 4)
export async function getSeasonsList(opts?: GetSeasonsListOptions): Promise<SeasonListItem[]> {
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

type CompetitionTableQuery = {
  group_id?: number | string;
  season?: number;
};

// Endpoint: GET /standings/seasons/{season_id} (Pass 4: league_id tek başına
// yetmiyor, önce is_current sezon çözülüyor)
export const getCompetitionTableFull = async (
  competitionId: string,
  query?: CompetitionTableQuery
): Promise<CompetitionTableData | null> => {
  try {
    return await sportmonksFetchCompetitionTable(competitionId, query);
  } catch (error) {
    console.error('Error fetching competition table (sportmonks)', error);
    return null;
  }
};

// Endpoint: GET /standings/seasons/{season_id} (Pass 4, aynı primitif
// `getCompetitionTableFull` ile paylaşılıyor, sadece düz `table[]` dönülüyor)
export const getLeagueTable = async (competitionId: string): Promise<unknown[] | null> => {
  try {
    const data = await sportmonksFetchCompetitionTable(competitionId);
    return data?.table ?? null;
  } catch (error) {
    console.error('Error fetching league table (sportmonks)', error);
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

/** Gol krallığı: tür başına en çok bu kadar sayfa (50'şer → ilk 100 oyuncu). */
const TOPSCORER_MAX_PAGES = 2;

// Endpoint: GET /topscorers/seasons/{id}?filters=seasonTopscorerTypes:208 (Pass 4)
export const getTopScorers = async (
  competitionId: string,
  opts?: { season?: number }
): Promise<TopScorersPayload | null> => {
  try {
    // Gol (208) ve asist (209) AYRI sorgu, her biri en çok TOPSCORER_MAX_PAGES sayfa. Sportmonks satırları
    // (type_id, position) sırasıyla döndürüyor: birleşik sorguda önce bütün gol satırları gelir, büyük ligde
    // (MLS: ~700 satır, 15 sayfa) sayfa sınırı asistleri tamamen keserdi. Ayrı sorgu + sınır: ilk 100 golcü ve
    // ilk 100 asistçi; Süper Lig yine 4 istek, MLS 15 → 4 (proxy izin listesi en çok 10. sayfa).
    const [goalRows, assistRows] = await Promise.all([
      sportmonksFetchTopscorerRows(competitionId, opts?.season, [GOAL_TOPSCORER_TYPE_ID], 'getTopScorers', TOPSCORER_MAX_PAGES),
      sportmonksFetchTopscorerRows(competitionId, opts?.season, [ASSIST_TOPSCORER_TYPE_ID], 'getTopScorers/assists', TOPSCORER_MAX_PAGES).catch(
        () => null,
      ),
    ]);
    if (goalRows == null) return null;
    const rows = [...goalRows, ...(assistRows ?? [])];
    const leagueId = Number(competitionId);
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
  if (!Number.isFinite(seasonId)) return {};
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
  if (!Number.isFinite(seasonId) || !Number.isFinite(teamId)) return {};
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
  if (!Number.isFinite(seasonId) || !Number.isFinite(teamId)) return [];
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

// Endpoint: GET /topscorers/seasons/{id}?filters=seasonTopscorerTypes:83,84 (Pass 4:
// `getTopScorers` ile AYNI endpoint/primitif — `sportmonksFetchTopscorerRows` — sadece
// filtre type_id'leri farklı; iki satır [kırmızı,sarı] oyuncu bazında tek satıra birleştiriliyor).
export const getTopDisciplinary = async (competitionId: string): Promise<DisciplinaryRow[]> => {
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
};

// Group matches by league with priority sorting
export type GroupedLeagueMatches = {
  competition_id: number;
  competition_name: string;
  /** `match.country.id` (bayrak görseli: `country_flag`) */
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
