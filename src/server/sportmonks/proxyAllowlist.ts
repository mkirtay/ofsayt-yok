/**
 * `/api/sportmonks/...` proxy'sinin izin listesi (path + include + query). Web'in bugün kullandığı her şey
 * (bkz. services/liveScoreService.ts, playerProfile.ts, teamUpcoming.ts, FavoritesTab, useTeamSearch) burada.
 * Mobil uygulamanın listesi henüz yok → varsayılan mod `log`: listede olmayanlar ENGELLENMEZ, loglanır
 * (Sentry + sunucu logu). 7 gün log + mobil liste sonrası `SPORTMONKS_ALLOWLIST_MODE=enforce` ile zorunlu.
 */
import * as Sentry from '@sentry/nextjs';

export type AllowlistMode = 'log' | 'enforce' | 'off';

export function allowlistMode(env: string | undefined = process.env.SPORTMONKS_ALLOWLIST_MODE): AllowlistMode {
  return env === 'enforce' || env === 'off' ? env : 'log';
}

const DATE = '\\d{4}-\\d{2}-\\d{2}';
const ID = '\\d{1,12}';

/** Normalize path (baştaki/sondaki `/` yok) kalıpları. */
const PATH_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'livescores/inplay', re: /^football\/livescores\/inplay$/ },
  { name: 'fixtures/date/{date}', re: new RegExp(`^football/fixtures/date/${DATE}$`) },
  { name: 'fixtures/between/{date}/{date}', re: new RegExp(`^football/fixtures/between/${DATE}/${DATE}$`) },
  { name: 'fixtures/between/{date}/{date}/{id}', re: new RegExp(`^football/fixtures/between/${DATE}/${DATE}/${ID}$`) },
  { name: 'fixtures/{id}', re: new RegExp(`^football/fixtures/${ID}$`) },
  { name: 'fixtures/multi/{ids}', re: new RegExp(`^football/fixtures/multi/${ID}(,${ID}){0,49}$`) },
  { name: 'fixtures/head-to-head/{id}/{id}', re: new RegExp(`^football/fixtures/head-to-head/${ID}/${ID}$`) },
  { name: 'leagues/{id}', re: new RegExp(`^football/leagues/${ID}$`) },
  { name: 'standings/seasons/{id}', re: new RegExp(`^football/standings/seasons/${ID}$`) },
  { name: 'topscorers/seasons/{id}', re: new RegExp(`^football/topscorers/seasons/${ID}$`) },
  { name: 'squads/teams/{id}', re: new RegExp(`^football/squads/teams/${ID}$`) },
  { name: 'squads/seasons/{id}/teams/{id}', re: new RegExp(`^football/squads/seasons/${ID}/teams/${ID}$`) },
  { name: 'teams/{id}', re: new RegExp(`^football/teams/${ID}$`) },
  { name: 'teams/search/{q}', re: /^football\/teams\/search\/[^/]{1,60}$/ },
  { name: 'players/{id}', re: new RegExp(`^football/players/${ID}$`) },
];

/** Include token'ları (`;` ile ayrılmış; `:alan,alan` seçimi yok sayılır). */
const INCLUDE_TOKENS = new Set([
  // maç (SPORTMONKS_FIXTURE_INCLUDE + detay)
  'participants', 'scores', 'state', 'periods', 'league', 'league.country', 'venue', 'referees.referee', 'round', 'stage',
  'group', 'events', 'statistics', 'lineups.player.nationality', 'lineups.details',
  // lig / puan / krallık / kadro
  'seasons', 'participant', 'details.type', 'player', 'player.statistics.details',
  // takım fikstürü
  'upcoming.participants', 'upcoming.league', 'upcoming.state',
  // oyuncu profili + maç satırları
  'nationality', 'city', 'position', 'detailedPosition', 'metadata.type', 'teams.team', 'transfers.type',
  'transfers.fromTeam', 'transfers.toTeam', 'statistics.details.type', 'statistics.season.league', 'statistics.team',
  'lineups.fixture.participants', 'lineups.fixture.scores', 'lineups.fixture.league',
]);

const FILTER_PREFIXES = new Set(['fixtureLeagues', 'seasonTopscorerTypes', 'playerStatisticSeasons', 'lineupDetailTypes', 'fixtureStates']);
const KNOWN_PARAMS = new Set(['include', 'filters', 'per_page', 'page', 'order', 'api_token']);
const MAX_PER_PAGE = 50;
const MAX_PAGE = 10;

export type AllowlistResult = { allowed: boolean; pathPattern: string; violations: string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Log imzası için path'i genelleştirir (id/tarih → yer tutucu) — Sentry'de aynı kalıplar tek sorunda toplansın. */
export function genericSportmonksPath(path: string): string {
  return path
    .replace(/^\/+|\/+$/g, '')
    .replace(new RegExp(DATE, 'g'), '{date}')
    .replace(/\/search\/[^/]+/, '/search/{q}')
    .replace(/\d{1,12}(,\d{1,12})+/g, '{ids}')
    .replace(/\b\d{1,12}\b/g, '{id}');
}

export function checkProxyAllowlist(path: string, query: Record<string, string | string[] | undefined>): AllowlistResult {
  const p = path.replace(/^\/+|\/+$/g, '');
  const violations: string[] = [];
  const pattern = PATH_PATTERNS.find((x) => x.re.test(p));
  if (!pattern) violations.push(`path:${genericSportmonksPath(p)}`);

  for (const key of Object.keys(query)) {
    if (key !== 'path' && !KNOWN_PARAMS.has(key)) violations.push(`param:${key}`);
  }

  const include = first(query.include);
  if (include) {
    for (const raw of include.split(';')) {
      const token = raw.split(':')[0]!.trim();
      if (token && !INCLUDE_TOKENS.has(token)) violations.push(`include:${token}`);
    }
  }

  const filters = first(query.filters);
  if (filters) {
    for (const part of filters.split(';')) {
      const prefix = part.split(':')[0]!.trim();
      if (prefix && !FILTER_PREFIXES.has(prefix)) violations.push(`filter:${prefix}`);
    }
  }

  const perPage = Number(first(query.per_page) ?? '0');
  if (!Number.isFinite(perPage) || perPage > MAX_PER_PAGE) violations.push(`per_page:${first(query.per_page)}`);
  const page = Number(first(query.page) ?? '1');
  if (!Number.isFinite(page) || page > MAX_PAGE) violations.push(`page:${first(query.page)}`);
  const order = first(query.order);
  if (order && order !== 'asc' && order !== 'desc') violations.push(`order:${order}`);

  return { allowed: violations.length === 0, pathPattern: pattern?.name ?? genericSportmonksPath(p), violations };
}

/** Aynı imza için instance başına en fazla 10 dk'da bir Sentry olayı (log satırı her seferinde). */
const LOG_THROTTLE_MS = 10 * 60_000;
const lastLogged = new Map<string, number>();

export function logAllowlistViolation(
  result: AllowlistResult,
  ctx: { userAgent?: string; mode: AllowlistMode },
  now: number = Date.now(),
): void {
  const signature = `${result.pathPattern}|${[...result.violations].sort().join(',')}`;
  console.warn(
    JSON.stringify({
      event: 'sportmonks_allowlist_miss',
      mode: ctx.mode,
      pathPattern: result.pathPattern,
      violations: result.violations,
      userAgent: ctx.userAgent?.slice(0, 200),
    }),
  );
  const last = lastLogged.get(signature);
  if (last !== undefined && now - last < LOG_THROTTLE_MS) return;
  lastLogged.set(signature, now);
  Sentry.withScope((scope) => {
    scope.setLevel(ctx.mode === 'enforce' ? 'warning' : 'info');
    scope.setTag('sportmonks.allowlist_mode', ctx.mode);
    scope.setTag('sportmonks.path_pattern', result.pathPattern);
    scope.setExtras({ violations: result.violations, userAgent: ctx.userAgent?.slice(0, 200) });
    scope.setFingerprint(['sportmonks-allowlist', signature]);
    Sentry.captureMessage(`Sportmonks proxy izin listesi dışı: ${result.pathPattern} (${result.violations.join(', ')})`);
  });
}

/** Test yardımcısı. */
export function resetAllowlistLogThrottle(): void {
  lastLogged.clear();
}
