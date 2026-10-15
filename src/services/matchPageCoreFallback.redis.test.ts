import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeRedis, type FakeRedis } from '@/server/sportmonks/fakeRedis.testutil';
import celtaVigoFixture from './sportmonks/__fixtures__/celtaVigoFixture.json';

// Birleşik maç isteği 429 aldığında (Redis'te kendi kopyası yok — ör. deploy sonrası ilk saatler) hafif yedek, eski ana
// istekle aynı anahtardaki eski kopyadan çekirdek veriyi verir; havuz soğumada olduğu için upstream'e ikinci istek gitmez.

const h = vi.hoisted(() => ({ redis: null as FakeRedis | null }));
vi.mock('@/lib/redis', () => ({
  MAX_REDIS_VALUE_BYTES: 900_000,
  getRedisClient: () => h.redis,
  withRedis: async <T,>(fn: (r: FakeRedis) => Promise<T>, fallback: T) => (h.redis ? fn(h.redis).catch(() => fallback) : fallback),
}));
vi.mock('@/services/sportmonks/quotaMonitor', () => ({
  reportSportmonksQuota: vi.fn(),
  reportSportmonksRateLimited: vi.fn(),
  currentRequestRoute: () => 'GET /matches/[slug]',
  quotaAlertDue: () => false,
}));

const T0 = Date.parse('2026-10-15T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  h.redis = createFakeRedis(() => Date.now());
  process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED = 'true';
  process.env.SPORTMONKS_API_KEY = 'test-token';
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('birleşik istek 429 → hafif yedek eski kopyadan', () => {
  it('çekirdek veri (maç + olaylar) gelir, partial; upstream yalnız birleşik istek için çağrılır', async () => {
    const { fetchSportmonksCached } = await import('@/server/sportmonks/cachedFetch');
    const mod = await import('./liveScoreService');
    // Deploy öncesi: eski ana istek (aynı anahtar) Redis'te.
    const seed = vi.spyOn(global, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ data: celtaVigoFixture, rate_limit: { remaining: 2000, resets_in_seconds: 3000, requested_entity: 'Fixture' } }), { status: 200 }),
    );
    await fetchSportmonksCached('football/fixtures/19732740', { include: mod.MATCH_CORE_INCLUDE, filters: mod.MATCH_CORE_FILTERS }, { origin: 'server' });
    seed.mockRestore();

    // 2 gün sonra (taze süre bitti, eski kopya saklamada) birleşik istek 429.
    vi.setSystemTime(T0 + 2 * 86_400_000);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const upstream = vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ message: 'Too Many Attempts.' }), { status: 429 }));
    const r = await mod.lookupSportmonksFixture('19732740');
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(r.partial).toBe(true);
    expect(r.events.length).toBeGreaterThan(0);
    expect(upstream.mock.calls.every((c) => decodeURIComponent(String(c[0])).includes(';statistics'))).toBe(true);
  });

  it('eski kopya da yoksa → error (sayfa 503 + Retry-After, istemci yeniden dener)', async () => {
    const mod = await import('./liveScoreService');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 429 }));
    expect((await mod.lookupSportmonksFixture('19732740')).kind).toBe('error');
  });
});
