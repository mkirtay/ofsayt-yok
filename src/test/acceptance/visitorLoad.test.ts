import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRedis, type FakeRedis } from '@/server/sportmonks/fakeRedis.testutil';
import { createUpstreamCounter, simulateVisitors, type VisitorPattern, type SimulationResult } from './visitorLoad';

/**
 * KABUL: 10 dakikalık senaryoda 1 ziyaretçi ile 20 eşzamanlı ziyaretçi arasında upstream Fixture
 * isteği sayısı neredeyse aynı kalmalı. Proxy route'u ve sunucu (SSR) yolu gerçek kodla, Redis ve
 * Sportmonks sahte; saat sahte (10 dk anında koşar).
 */

const h = vi.hoisted(() => ({ clock: { t: 0 }, redis: null as FakeRedis | null, scenario: 'quiet' as 'quiet' | 'live' }));

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => h.redis,
  withRedis: async <T,>(fn: (r: FakeRedis) => Promise<T>, fallback: T) => {
    if (!h.redis) return fallback;
    try {
      return await fn(h.redis);
    } catch {
      return fallback;
    }
  },
}));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: true, remaining: 99, resetAt: 0 }),
  requestIp: (headers: Record<string, string>) => headers['x-forwarded-for'] ?? '0.0.0.0',
}));
vi.mock('@/services/sportmonks/quotaMonitor', () => ({ reportSportmonksQuota: vi.fn(), reportSportmonksRateLimited: vi.fn(), currentRequestRoute: () => 'test' }));

const START = Date.parse('2026-09-30T13:00:00Z'); // maçsız öğleden sonra; bugünün tek maçı 19:00'da
const TODAY = '2026-09-30';
const INC = 'participants;scores;state;periods;league.country;venue;referees.referee;round;stage;group';
const enc = encodeURIComponent;

/** C öncesi ana sayfa + maç detayı istek kalıbı (tarayıcı ağ kaydından): ham proxy, 30 sn polling, between + date. */
const PRE_C_PATTERN: VisitorPattern = {
  homeInitial: (d) => [
    `football/fixtures/between/${d}/${d}?include=${enc(INC)}&per_page=50&page=1`,
    `football/livescores/inplay?include=${enc(INC)}&per_page=50&page=1`,
    `football/fixtures/date/${d}?include=${enc(INC)}&per_page=50&page=1`,
    'football/leagues/600?include=seasons',
    'football/leagues/600?include=seasons',
    `football/standings/seasons/28203?include=${enc('participant;details.type')}&per_page=50&page=1`,
    ...[1, 2, 3, 4].map(
      (p) => `football/topscorers/seasons/28203?include=${enc('player;participant')}&filters=${enc('seasonTopscorerTypes:208')}&per_page=50&page=${p}`,
    ),
  ],
  homePollSeconds: 30,
  homePoll: (d) => [
    `football/livescores/inplay?include=${enc(INC)}&per_page=50&page=1`,
    `football/fixtures/date/${d}?include=${enc(INC)}&per_page=50&page=1`,
  ],
  matchSsr: (id) => [{ path: `/fixtures/${id}`, params: { include: `${INC};events` } }],
  matchClient: (id, d, from89) => [
    `football/fixtures/${id}?include=${enc(`${INC};events`)}`,
    `football/fixtures/${id}?include=statistics`,
    `football/fixtures/${id}?include=${enc('lineups.player.nationality;lineups.details;participants')}`,
    `football/fixtures/head-to-head/34/88?include=${enc(INC)}`,
    `football/fixtures/between/${from89}/${d}/34?include=${enc(INC)}&per_page=50&page=1`,
    `football/fixtures/between/${from89}/${d}/88?include=${enc(INC)}&per_page=50&page=1`,
    'football/leagues/600?include=seasons',
    `football/standings/seasons/28203?include=${enc('participant;details.type')}&per_page=50&page=1`,
  ],
};

const RATE = { rate_limit: { resets_in_seconds: 3000, remaining: 2000, requested_entity: 'Fixture' } };
const eveningMatch = { id: 19746594, state_id: 1, starting_at: `${TODAY} 19:00:00` };
const liveMatch = { id: 19746001, state_id: 2, starting_at: `${TODAY} 12:30:00` };

function respond(url: string): { status: number; body: unknown } {
  const u = new URL(url);
  const p = u.pathname.replace(/^\/v3\//, '');
  const page = Number(u.searchParams.get('page') ?? '1');
  const list = (data: unknown[], hasMore = false) => ({ status: 200, body: { data, pagination: { has_more: hasMore }, ...RATE } });
  if (p.startsWith('football/livescores/')) {
    return h.scenario === 'live' ? list([liveMatch]) : { status: 200, body: { message: 'No result(s) found matching your request.', ...RATE } };
  }
  if (p === `football/fixtures/date/${TODAY}` || p.startsWith(`football/fixtures/between/${TODAY}`)) {
    return list(h.scenario === 'live' ? [liveMatch, eveningMatch] : [eveningMatch]);
  }
  // Diğer günler (ör. Türkiye günü için çekilen önceki UTC günü): bitmiş maçlar.
  if (p.startsWith('football/fixtures/date/')) return list([{ id: 9, state_id: 5, starting_at: '2026-09-29 18:00:00' }]);
  if (/^football\/fixtures\/\d+$/.test(p)) return { status: 200, body: { data: eveningMatch, ...RATE } };
  if (p.startsWith('football/fixtures/')) return list([{ id: 1, state_id: 5, starting_at: '2026-08-01 17:00:00' }]);
  if (p.startsWith('football/topscorers/')) return list([], page < 4);
  if (p.startsWith('football/leagues/')) return { status: 200, body: { data: { id: 600, seasons: [] }, ...RATE } };
  return list([]);
}

const SIDEBAR = (): string[] => [
  'football/leagues/600?include=seasons',
  'football/leagues/600?include=seasons',
  `football/standings/seasons/28203?include=${enc('participant;details.type')}&per_page=50&page=1`,
  ...[1, 2, 3, 4].map(
    (p) => `football/topscorers/seasons/28203?include=${enc('player;participant')}&filters=${enc('seasonTopscorerTypes:208')}&per_page=50&page=${p}`,
  ),
];

/**
 * C sonrası: ana sayfa tek normalize uca gider (`/api/matches/day`, sunucuda yalnız fixtures/date + inplay),
 * polling canlı/başlamak üzere maç varken 30 sn, yoksa 5 dk (`homePollDelayMs`).
 */
const postCPattern = (scenario: 'quiet' | 'live'): VisitorPattern => ({
  homeInitial: (d) => [`api/matches/day?date=${d}`, ...SIDEBAR()],
  homePollSeconds: scenario === 'live' ? 30 : 300,
  homePoll: (d) => [`api/matches/day?date=${d}`],
  matchSsr: PRE_C_PATTERN.matchSsr,
  matchClient: PRE_C_PATTERN.matchClient,
});

async function run(visitors: number, pattern: VisitorPattern): Promise<SimulationResult> {
  vi.resetModules();
  h.clock.t = START;
  h.redis = createFakeRedis(() => h.clock.t);
  vi.setSystemTime(START);
  const counter = createUpstreamCounter();
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    counter.record(url);
    const r = respond(url);
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  const proxyHandler = (await import('@/pages/api/sportmonks/[...path]')).default;
  const dayHandler = (await import('@/pages/api/matches/day')).default;
  const { sportmonksClientRequest } = await import('@/services/sportmonksRuntimeClient');
  return simulateVisitors(
    visitors,
    pattern,
    {
      proxyHandler,
      apiHandlers: { 'api/matches/day': dayHandler },
      serverRequest: (path, params) => sportmonksClientRequest('football', path, params),
      setNow: (ms) => {
        h.clock.t = ms;
        vi.setSystemTime(ms);
      },
    },
    counter,
    { start: START },
  );
}

function table(cols: [string, SimulationResult][]): string {
  const keys = [...new Set(cols.flatMap(([, r]) => Object.keys(r.byPath)))].sort();
  const cell = (n: number | undefined) => String(n ?? 0).padStart(6);
  const head = cols.map(([name]) => name.padStart(6)).join(' |') + ' | path';
  const rows = keys.map((k) => cols.map(([, r]) => cell(r.byPath[k])).join(' |') + ` | ${k}`);
  return [
    head,
    ...rows,
    cols.map(([, r]) => cell(r.fixturePool)).join(' |') + ' | Fixture havuzu toplam',
    cols.map(([, r]) => cell(r.total)).join(' |') + ' | tüm havuzlar',
  ].join('\n');
}

describe('KABUL — upstream istek sayısı ziyaretçi sayısından bağımsız (10 dk)', () => {
  const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;
  const ORIGINAL_ENABLED = process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
  beforeEach(() => {
    process.env.SPORTMONKS_API_KEY = 'test-token';
    process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
    else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
    if (ORIGINAL_ENABLED === undefined) delete process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED;
    else process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = ORIGINAL_ENABLED;
  });

  for (const scenario of ['quiet', 'live'] as const) {
    it(`${scenario === 'quiet' ? 'maçsız öğleden sonra' : 'canlı maç varken'}: 1 vs 20 ziyaretçi`, async () => {
      h.scenario = scenario;
      const bOne = await run(1, PRE_C_PATTERN);
      const bMany = await run(20, PRE_C_PATTERN);
      const one = await run(1, postCPattern(scenario));
      const many = await run(20, postCPattern(scenario));
      if (process.env.ACCEPTANCE_VERBOSE) {
        console.info(
          `\n[${scenario}] B = yalnız ortak cache (eski ana sayfa kalıbı), C = + normalize uç/akıllı polling\n` +
            table([['B·1', bOne], ['B·20', bMany], ['C·1', one], ['C·20', many]]) +
            `\n  gelen Fixture istekleri (cache olmasaydı upstream): B·1=${bOne.incomingFixturePool} B·20=${bMany.incomingFixturePool}`,
        );
      }

      // Her path için upstream sayısı ziyaretçi sayısıyla değil, TTL ile sınırlı: 20 ziyaretçi, 1 ziyaretçinin
      // en fazla ~1,5 katı (küçük sayılarda +5 pay). Fark yalnızca 20 sn'lik canlı skor TTL'inin polling
      // aralığından kısa olmasından: ziyaretçiler ilk dakikaya yayıldığı için birkaç TTL penceresine denk gelir.
      for (const result of [[bOne, bMany], [one, many]] as const) {
        const [a, b] = result;
        for (const [path, count] of Object.entries(b.byPath)) {
          const base = a.byPath[path] ?? 0;
          expect(count, path).toBeLessThanOrEqual(Math.max(Math.ceil(base * 1.5) + 1, base + 5));
        }
        expect(b.fixturePool).toBeLessThanOrEqual(Math.ceil(a.fixturePool * 1.5));
      }
      // Mutlak üst sınır: 10 dk'da canlı skor en fazla 600/20 + 1 kez.
      expect(many.byPath['football/livescores/inplay'] ?? 0).toBeLessThanOrEqual(31);
      // C ana sayfada between'i kaldırır ve maçsız saatlerde polling'i seyreltir.
      expect(Object.keys(many.byPath).some((k) => k === `football/fixtures/between/${TODAY}/${TODAY}`)).toBe(false);
      // Tek ek: "gece maçları" için UTC yarın listesi (bkz. server/homeDay.ts) — ziyaretçiden bağımsız, 10 dk'da en çok 1
      // (tavan 15 dk, bkz. cachePolicy). Onun dışında C, B'den fazla istek atmaz.
      const nightList = many.byPath['football/fixtures/date/2026-10-01'] ?? 0;
      expect(nightList).toBeLessThanOrEqual(1);
      expect(many.fixturePool - nightList).toBeLessThanOrEqual(bMany.fixturePool);
    });
  }
});
