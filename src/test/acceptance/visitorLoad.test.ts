import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRedis, type FakeRedis } from '@/server/sportmonks/fakeRedis.testutil';
import { createUpstreamCounter, simulateVisitors, type VisitorPattern, type SimulationResult } from './visitorLoad';

/**
 * KABUL: 10 dakikalık senaryoda 1 ziyaretçi ile 20 eşzamanlı ziyaretçi arasında upstream Fixture
 * isteği sayısı neredeyse aynı kalmalı. Proxy route'u ve sunucu (SSR) yolu gerçek kodla, Redis ve
 * Sportmonks sahte; saat sahte (10 dk anında koşar).
 */

const h = vi.hoisted(() => ({ clock: { t: 0 }, redis: null as FakeRedis | null, scenario: 'quiet' as 'quiet' | 'live' }));

vi.mock('@/lib/redis', () => ({ getRedisClient: () => h.redis }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: true, remaining: 99, resetAt: 0 }),
  requestIp: (headers: Record<string, string>) => headers['x-forwarded-for'] ?? '0.0.0.0',
}));
vi.mock('@/services/sportmonks/quotaMonitor', () => ({ reportSportmonksQuota: vi.fn() }));

const START = Date.parse('2026-09-30T13:00:00Z'); // maçsız öğleden sonra; bugünün tek maçı 19:00'da
const TODAY = '2026-09-30';
const INC = 'participants;scores;state;periods;league.country;venue;referees.referee;round;stage;group';
const enc = encodeURIComponent;

/** Bugünkü (C öncesi) ana sayfa + maç detayı istek kalıbı — tarayıcı ağ kaydından. */
const CURRENT_PATTERN: VisitorPattern = {
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
  if (p.startsWith(`football/fixtures/date/`) || p.startsWith(`football/fixtures/between/${TODAY}`)) {
    return list(h.scenario === 'live' ? [liveMatch, eveningMatch] : [eveningMatch]);
  }
  if (/^football\/fixtures\/\d+$/.test(p)) return { status: 200, body: { data: eveningMatch, ...RATE } };
  if (p.startsWith('football/fixtures/')) return list([{ id: 1, state_id: 5, starting_at: '2026-08-01 17:00:00' }]);
  if (p.startsWith('football/topscorers/')) return list([], page < 4);
  if (p.startsWith('football/leagues/')) return { status: 200, body: { data: { id: 600, seasons: [] }, ...RATE } };
  return list([]);
}

async function run(visitors: number): Promise<SimulationResult> {
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
  const { sportmonksClientRequest } = await import('@/services/sportmonksRuntimeClient');
  return simulateVisitors(
    visitors,
    CURRENT_PATTERN,
    {
      proxyHandler,
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

function table(one: SimulationResult, many: SimulationResult): string {
  const keys = [...new Set([...Object.keys(one.byPath), ...Object.keys(many.byPath)])].sort();
  const rows = keys.map((k) => `  ${String(one.byPath[k] ?? 0).padStart(3)} | ${String(many.byPath[k] ?? 0).padStart(3)} | ${k}`);
  return [' 1 z. | 20 z. | path', ...rows, `  ${one.fixturePool} | ${many.fixturePool} | Fixture havuzu toplam`, `  ${one.total} | ${many.total} | tüm havuzlar`, `  ${one.incomingFixturePool} | ${many.incomingFixturePool} | (gelen Fixture istekleri — cache olmasaydı upstream)`].join('\n');
}

describe('KABUL — upstream istek sayısı ziyaretçi sayısından bağımsız (10 dk)', () => {
  const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;
  beforeEach(() => {
    process.env.SPORTMONKS_API_KEY = 'test-token';
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
    else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
  });

  for (const scenario of ['quiet', 'live'] as const) {
    it(`${scenario === 'quiet' ? 'maçsız öğleden sonra' : 'canlı maç varken'}: 1 vs 20 ziyaretçi`, async () => {
      h.scenario = scenario;
      const one = await run(1);
      const many = await run(20);
      if (process.env.ACCEPTANCE_VERBOSE) console.info(`\n[${scenario}]\n${table(one, many)}`);

      // Her path için upstream sayısı TTL ile sınırlı: 20 ziyaretçi, 1 ziyaretçinin en fazla ~1,5 katı
      // (fark yalnızca 20 sn'lik canlı skor TTL'inin 30 sn'lik polling aralığından kısa olmasından).
      for (const [path, count] of Object.entries(many.byPath)) {
        expect(count, path).toBeLessThanOrEqual(Math.ceil((one.byPath[path] ?? 0) * 1.5) + 1);
      }
      expect(many.fixturePool).toBeLessThanOrEqual(Math.ceil(one.fixturePool * 1.5));
      // Mutlak üst sınır: 10 dk'da canlı skor en fazla 600/20 + 1 kez.
      const inplay = many.byPath['football/livescores/inplay'] ?? 0;
      expect(inplay).toBeLessThanOrEqual(31);
    });
  }
});
