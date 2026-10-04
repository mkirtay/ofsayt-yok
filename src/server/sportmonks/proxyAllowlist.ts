/**
 * `/api/sportmonks/...` proxy'sinin izin listesi (path + include + query). Web'in bugün kullandığı her şey
 * (bkz. services/liveScoreService.ts, playerProfile.ts, teamUpcoming.ts, FavoritesTab, useTeamSearch) burada.
 * Varsayılan mod `enforce` (2026-10-04, güvenlik denetimi: 7 Ekim planı öne çekildi): listede olmayan istek 403 +
 * log. `SPORTMONKS_ALLOWLIST_MODE=log` yalnız loglar, `off` listeyi kapatır.
 *
 * Moddan BAĞIMSIZ her zaman uygulanır (`unsafe` → 400): yol segmentinde `.`/`..`, `%`, `?`, `#`, `\`, `/`, kontrol
 * karakteri; tekrarlanan (dizi) parametre. Bilinmeyen parametreler upstream'e gitmez (atılır). Upstream'e ve önbellek
 * anahtarına yalnız `query` (temizlenmiş, tekil değerler) gider.
 */
import * as Sentry from '@sentry/nextjs';

export type AllowlistMode = 'log' | 'enforce' | 'off';

export function allowlistMode(env: string | undefined = process.env.SPORTMONKS_ALLOWLIST_MODE): AllowlistMode {
  return env === 'log' || env === 'off' ? env : 'enforce';
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
  { name: 'schedules/seasons/{id}/teams/{id}', re: new RegExp(`^football/schedules/seasons/${ID}/teams/${ID}$`) },
  { name: 'teams/{id}', re: new RegExp(`^football/teams/${ID}$`) },
  // Arama terimi: yalnız harf, rakam, boşluk ve . ' - (sorgu/yol enjeksiyonu yok)
  { name: 'teams/search/{q}', re: /^football\/teams\/search\/[\p{L}\p{N} .'-]{1,60}$/u },
  { name: 'players/{id}', re: new RegExp(`^football/players/${ID}$`) },
];

/** Include token'ları (`;` ile ayrılmış; `:alan,alan` seçimi yok sayılır). */
const INCLUDE_TOKENS = new Set([
  // maç (SPORTMONKS_FIXTURE_INCLUDE + detay)
  'participants', 'scores', 'state', 'periods', 'league', 'league.country', 'venue', 'referees.referee', 'round', 'stage',
  'group', 'events', 'statistics', 'lineups.player.nationality', 'lineups.details',
  // iki ayaklı eşleşme toplam skoru (SPORTMONKS_FIXTURE_INCLUDE)
  'aggregate',
  // kadro resmî mi (metadata type 572 `confirmed`) / maç hashtag'i (613) — `metadataTypes` filtresiyle
  'metadata',
  // maç detayı ekleri: Türkiye yayıncıları, teknik direktörler, hava (services/sportmonks/matchExtras.ts)
  'tvStations.tvStation', 'coaches', 'weatherReport',
  // lig / puan / krallık / kadro
  'seasons', 'participant', 'details.type', 'player', 'player.statistics.details',
  // takım fikstürü (mobil) + takım sayfası tek isteği (services/sportmonks/teamOverview.ts)
  'upcoming.participants', 'upcoming.league', 'upcoming.state', 'upcoming.scores', 'upcoming.periods',
  'latest.participants', 'latest.scores', 'latest.league', 'latest.state',
  'coaches.coach', 'seasons.league',
  // takım sezon istatistikleri (services/sportmonks/teamSeasonStats.ts)
  'statistics.details', 'statistics.season', 'sidelined.player', 'sidelined.type',
  // bitmiş sezonun oyuncu istatistiği (sezon `finished` bayrağı → 30 gün önbellek)
  'player.statistics.season',
  // oyuncu profili + maç satırları
  'nationality', 'city', 'position', 'detailedPosition', 'metadata.type', 'teams.team', 'transfers.type',
  'transfers.fromTeam', 'transfers.toTeam', 'statistics.details.type', 'statistics.season.league', 'statistics.team',
  'lineups.fixture.participants', 'lineups.fixture.scores', 'lineups.fixture.league',
]);

const FILTER_PREFIXES = new Set([
  'fixtureLeagues',
  'seasonTopscorerTypes',
  'playerStatisticSeasons',
  'lineupDetailTypes',
  'fixtureStates',
  'metadataTypes',
  'teamStatisticSeasons',
  // Gol Krallığı O (oynanan maç) topscorers yanıtına gömülü (services/competitionTopScorers.ts)
  'playerStatisticDetailTypes',
]);
/** Upstream'e iletilen parametreler; `api_token` (tarayıcı boş gönderir) ve diğerleri atılır. */
const FORWARDED_PARAMS = new Set(['include', 'filters', 'per_page', 'page', 'order']);
const MAX_PER_PAGE = 50;
const MAX_PAGE = 10;
const MAX_INCLUDE_TOKENS = 25;
/** Alan seçimi (`include=coaches:common_name,display_name`). */
const FIELD_SELECTION = /^[a-z_]{1,40}(,[a-z_]{1,40}){0,19}$/;
/** Filtre değeri: id listesi. */
const FILTER_VALUE = /^\d{1,12}(,\d{1,12}){0,49}$/;
// eslint-disable-next-line no-control-regex
const UNSAFE_SEGMENT = /[%?#\\/\u0000-\u001f\u007f]/;

export type AllowlistResult = {
  /** İzin listesine uyuyor mu (mod `enforce` ise uymayan 403). */
  allowed: boolean;
  /** Moddan bağımsız reddedilir (400): güvensiz yol segmenti / dizi parametre. */
  unsafe: boolean;
  pathPattern: string;
  violations: string[];
  /** Normalize path (segmentler `/` ile). */
  path: string;
  /** Upstream'e ve önbellek anahtarına giden temizlenmiş sorgu (yalnız bilinen parametreler, tekil değerler). */
  query: Record<string, string>;
};

function unsafeSegments(segments: readonly string[]): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '.' || seg === '..' || UNSAFE_SEGMENT.test(seg)) out.push('segment:geçersiz');
  }
  return out;
}

/** Log imzası için path'i genelleştirir (id/tarih → yer tutucu) — Sentry'de aynı kalıplar tek sorunda toplansın. */
export function genericSportmonksPath(path: string): string {
  return path
    .replace(/^\/+|\/+$/g, '')
    .replace(new RegExp(DATE, 'g'), '{date}')
    .replace(/\/search\/[^/]+/, '/search/{q}')
    .replace(/\d{1,12}(,\d{1,12})+/g, '{ids}')
    .replace(/\b\d{1,12}\b/g, '{id}');
}

/**
 * @param path Next catch-all segmentleri (çözülmüş; tercih edilen — segment içi `/` yakalanır) ya da `a/b/c` metni.
 */
export function checkProxyAllowlist(
  path: string | readonly string[],
  query: Record<string, string | string[] | undefined>,
): AllowlistResult {
  // Metinde baştaki/sondaki `/` normalize edilir; aradaki boş segment (`a//b`) güvensiz.
  const segments = typeof path === 'string' ? path.replace(/^\/+|\/+$/g, '').split('/') : [...path];
  const unsafe: string[] = unsafeSegments(segments);
  if (segments.some((s) => s === '')) unsafe.push('segment:(boş)');
  const p = segments.join('/');

  const violations: string[] = [];
  const pattern = unsafe.length ? undefined : PATH_PATTERNS.find((x) => x.re.test(p));
  if (!pattern) violations.push(`path:${genericSportmonksPath(p)}`);

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === 'path' || value === undefined) continue;
    if (Array.isArray(value)) {
      unsafe.push(`param-dizi:${key.slice(0, 40)}`);
      continue;
    }
    if (FORWARDED_PARAMS.has(key)) clean[key] = value; // bilinmeyenler (api_token dahil) atılır
  }

  const include = clean.include;
  if (include !== undefined) {
    const tokens = include.split(';');
    if (tokens.length > MAX_INCLUDE_TOKENS) violations.push(`include:${tokens.length} öğe`);
    for (const raw of tokens) {
      const [token = '', fields, ...rest] = raw.split(':');
      if (!INCLUDE_TOKENS.has(token)) violations.push(`include:${token.slice(0, 60)}`);
      else if (rest.length || (fields !== undefined && !FIELD_SELECTION.test(fields))) violations.push(`include-alan:${token}`);
    }
  }

  const filters = clean.filters;
  if (filters !== undefined) {
    for (const part of filters.split(';')) {
      const [prefix = '', value, ...rest] = part.split(':');
      if (!FILTER_PREFIXES.has(prefix)) violations.push(`filter:${prefix.slice(0, 60)}`);
      else if (rest.length || value === undefined || !FILTER_VALUE.test(value)) violations.push(`filter-deger:${prefix}`);
    }
  }

  const intParam = (name: 'per_page' | 'page', max: number) => {
    const v = clean[name];
    if (v === undefined) return;
    if (!/^\d{1,3}$/.test(v) || Number(v) < 1 || Number(v) > max) violations.push(`${name}:${v.slice(0, 20)}`);
  };
  intParam('per_page', MAX_PER_PAGE);
  intParam('page', MAX_PAGE);
  const order = clean.order;
  if (order !== undefined && order !== 'asc' && order !== 'desc') violations.push(`order:${order.slice(0, 20)}`);

  const all = [...unsafe, ...violations];
  return {
    allowed: all.length === 0,
    unsafe: unsafe.length > 0,
    pathPattern: pattern?.name ?? (unsafe.length ? 'unsafe' : genericSportmonksPath(p)),
    violations: all,
    path: p,
    query: clean,
  };
}

/** Aynı imza için instance başına en fazla 10 dk'da bir Sentry olayı (log satırı her seferinde). */
const LOG_THROTTLE_MS = 10 * 60_000;
const LOG_SIGNATURES_MAX = 500;
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
  if (lastLogged.size >= LOG_SIGNATURES_MAX) lastLogged.clear(); // saldırgan değerli imzalar belleği şişirmesin
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
