/**
 * Uçtan uca (süreç içi): gerçek `runBotTick` varsayılan bağımlılıklarıyla → servis katmanı → paylaşımlı cache →
 * Sportmonks 429. Sentry olayı 52'ye çıkaran senaryo: her dakikalık tick 429 alıp `SportmonksHttpError` yazıyordu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeRedis, type FakeRedis } from '@/server/sportmonks/fakeRedis.testutil';

const h = vi.hoisted(() => ({
  clock: { t: Date.parse('2026-10-07T19:00:00Z') },
  redis: null as FakeRedis | null,
  captureError: vi.fn(),
  rateLimited: vi.fn(),
}));

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
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/logger', () => ({ captureError: h.captureError }));
vi.mock('@/services/sportmonks/quotaMonitor', () => ({
  reportSportmonksQuota: vi.fn(),
  reportSportmonksRateLimited: h.rateLimited,
  currentRequestRoute: () => 'POST /api/admin/gundem/bot-tick',
}));

const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;

describe('bot-tick × Sportmonks 429 (uçtan uca)', () => {
  let upstreamCalls: string[];

  beforeEach(() => {
    process.env.SPORTMONKS_API_KEY = 'test-token';
    h.clock.t = Date.parse('2026-10-07T19:00:00Z');
    // `new Date()` (tick) ve `Date.now()` (cache) aynı sahte saati görsün.
    vi.useFakeTimers({ toFake: ['Date'], now: h.clock.t });
    h.redis = createFakeRedis(() => h.clock.t);
    h.captureError.mockReset();
    h.rateLimited.mockReset();
    upstreamCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        upstreamCalls.push(new URL(String(input)).pathname);
        return new Response(JSON.stringify({ message: 'You have reached your rate limit for entity Fixture.' }), { status: 429 });
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
    else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
  });

  it('ilk tick en çok iki istek (dün + bugün listesi, paralel) atar; soğuma boyunca sonraki tick\'ler HİÇ istek atmaz; Sentry istisnası yok', async () => {
    vi.resetModules();
    const { runBotTick } = await import('./tick');

    const first = await runBotTick();
    expect(first.degraded).toBe('rate-limited');
    expect(upstreamCalls.length).toBeGreaterThanOrEqual(1);
    expect(upstreamCalls.length).toBeLessThanOrEqual(2);
    expect(upstreamCalls.every((p) => p.includes('/fixtures/date/'))).toBe(true); // inplay'e hiç gidilmedi

    const afterFirst = upstreamCalls.length;
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime((h.clock.t += 10_000)); // dakikalık cron'un sık hali; soğuma (60 sn) içinde
      expect((await runBotTick()).degraded).toBe('rate-limited');
    }
    expect(upstreamCalls.length).toBe(afterFirst);
    expect(h.captureError).not.toHaveBeenCalled();
    expect(h.rateLimited).toHaveBeenCalledTimes(1);

    // Soğuma bitince yeniden denenir (hâlâ 429 → yeni soğuma, yine tek olay)
    vi.setSystemTime((h.clock.t += 61_000));
    await runBotTick();
    expect(upstreamCalls.length).toBeGreaterThan(afterFirst);
    expect(h.rateLimited).toHaveBeenCalledTimes(2);
    expect(h.captureError).not.toHaveBeenCalled();
  });
});
