import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRedis, type FakeRedis } from './fakeRedis.testutil';

const h = vi.hoisted(() => ({
  clock: { t: Date.parse('2026-09-30T12:00:00Z') },
  redis: null as FakeRedis | null,
  quota: vi.fn(),
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
vi.mock('@/services/sportmonks/quotaMonitor', () => ({ reportSportmonksQuota: h.quota }));

type Mod = typeof import('./cachedFetch');
const now = () => h.clock.t;
const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;

/** Her çağrıda yeni `Response`; path başına sayaç. */
function upstream(respond: (url: string) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>) {
  const calls: string[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = await respond(url);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const envelope = (data: unknown) => ({
  data,
  subscription: [{ meta: { trial_ends_at: 'x' }, plans: [{ plan: 'Growth' }] }],
  rate_limit: { resets_in_seconds: 3000, remaining: 2400, requested_entity: 'Fixture' },
  timezone: 'UTC',
});

async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import('./cachedFetch');
}

describe('fetchSportmonksCached', () => {
  let m: Mod;

  beforeEach(async () => {
    process.env.SPORTMONKS_API_KEY = 'test-token';
    h.clock.t = Date.parse('2026-09-30T12:00:00Z');
    h.redis = createFakeRedis(now);
    h.quota.mockReset();
    m = await freshModule();
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
    else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
  });

  it('MISS → HIT; api_token anahtara girmez; subscription/rate_limit/timezone çıkarılır; kota bir kez raporlanır', async () => {
    const up = upstream(() => ({ status: 200, body: envelope([]) }));
    const q = { include: 'participants;state', api_token: 'from-browser' };

    const a = await m.fetchSportmonksCached('/football/livescores/inplay/', q, { fetchImpl: up.impl, now, origin: 'proxy' });
    const b = await m.fetchSportmonksCached('football/livescores/inplay', { include: 'participants;state' }, { fetchImpl: up.impl, now });

    expect(a.cache).toBe('MISS');
    expect(b.cache).toBe('HIT');
    expect(up.calls).toHaveLength(1);
    expect(up.calls[0]).toContain('api_token=test-token');
    expect(up.calls[0]).not.toContain('from-browser');
    expect(a.body).toEqual({ data: [] });
    expect(h.quota).toHaveBeenCalledTimes(1);
    expect(h.quota.mock.calls[0]![0]).toMatchObject({ pool: 'Fixture', remaining: 2400, path: '/football/livescores/inplay', origin: 'proxy' });
  });

  it('süre dolunca yeniden upstream (canlı skor 20 sn)', async () => {
    const up = upstream(() => ({ status: 200, body: envelope([]) }));
    const opts = { fetchImpl: up.impl, now };
    await m.fetchSportmonksCached('football/livescores/inplay', {}, opts);
    h.clock.t += 19_000;
    expect((await m.fetchSportmonksCached('football/livescores/inplay', {}, opts)).cache).toBe('HIT');
    h.clock.t += 2_000;
    expect((await m.fetchSportmonksCached('football/livescores/inplay', {}, opts)).cache).toBe('MISS');
    expect(up.calls).toHaveLength(2);
  });

  it('tekil uçuş: aynı anda gelen 20 aynı istek → 1 upstream', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const up = upstream(async () => {
      await gate;
      return { status: 200, body: envelope([]) };
    });
    const all = Array.from({ length: 20 }, () =>
      m.fetchSportmonksCached('football/fixtures/date/2026-09-30', { page: '1' }, { fetchImpl: up.impl, now }),
    );
    release();
    const results = await Promise.all(all);
    expect(up.calls).toHaveLength(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('instance\'lar arası Redis kilidi: ikinci instance upstream\'e gitmez, yazılanı bekler', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const upA = upstream(async () => {
      await gate;
      return { status: 200, body: envelope([{ id: 1 }]) };
    });
    const upB = upstream(() => ({ status: 200, body: envelope([{ id: 2 }]) }));
    const instanceA = m;
    const instanceB = await freshModule(); // ayrı L1 / in-flight, aynı Redis

    const pa = instanceA.fetchSportmonksCached('football/standings/seasons/1', {}, { fetchImpl: upA.impl, now });
    await new Promise((r) => setTimeout(r, 20)); // A kilidi alsın
    const pb = instanceB.fetchSportmonksCached('football/standings/seasons/1', {}, { fetchImpl: upB.impl, now });
    await new Promise((r) => setTimeout(r, 200));
    release();
    const [ra, rb] = await Promise.all([pa, pb]);

    expect(upA.calls).toHaveLength(1);
    expect(upB.calls).toHaveLength(0);
    expect(rb.body).toEqual(ra.body);
    expect(rb.cache).toBe('HIT');
  });

  it('Sportmonks 429/5xx → son geçerli veri (stale), kısa CDN süresi', async () => {
    let status = 200;
    const up = upstream(() =>
      status === 200 ? { status, body: envelope([{ id: 7 }]) } : { status, body: { message: 'Too Many Attempts.' } },
    );
    const opts = { fetchImpl: up.impl, now };
    await m.fetchSportmonksCached('football/standings/seasons/1', {}, opts);

    const other = await freshModule(); // L1'i olmayan başka instance, Redis'te eski kayıt var
    h.clock.t += 11 * 60_000; // 10 dk'lık taze süre doldu
    status = 429;
    const r = await other.fetchSportmonksCached('football/standings/seasons/1', {}, opts);

    expect(r.stale).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: [{ id: 7 }] });
    expect(other.sportmonksCacheControl(r)).toBe('public, s-maxage=15, stale-while-revalidate=60');
  });

  it('eski veri yoksa hata iletilir ve cache\'lenmez (no-store)', async () => {
    const up = upstream(() => ({ status: 503, body: { message: 'down' } }));
    const opts = { fetchImpl: up.impl, now };
    const r = await m.fetchSportmonksCached('football/standings/seasons/2', {}, opts);
    await m.fetchSportmonksCached('football/standings/seasons/2', {}, opts);
    expect(r.status).toBe(503);
    expect(r.cache).toBe('BYPASS');
    expect(m.sportmonksCacheControl(r)).toBe('no-store');
    expect(up.calls).toHaveLength(2);
  });

  it('negatif cache: bulunamayan fixture 1 sa boyunca tekrar sorulmaz', async () => {
    const up = upstream(() => ({ status: 404, body: { message: 'No result(s) found matching your request.' } }));
    const opts = { fetchImpl: up.impl, now };
    const a = await m.fetchSportmonksCached('football/fixtures/19999999', { include: 'events' }, opts);
    h.clock.t += 59 * 60_000;
    const b = await (await freshModule()).fetchSportmonksCached('football/fixtures/19999999', { include: 'events' }, opts);
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(b.cache).toBe('HIT');
    expect(up.calls).toHaveLength(1);
  });

  it('ağ hatası + eski veri yok → 502, no-store', async () => {
    const impl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const r = await m.fetchSportmonksCached('football/leagues/600', {}, { fetchImpl: impl, now });
    expect(r.status).toBe(502);
    expect(m.sportmonksCacheControl(r)).toBe('no-store');
  });

  it('CDN başlığı: kalan taze süre kadar s-maxage, 3×TTL stale-while-revalidate', async () => {
    const up = upstream(() => ({ status: 200, body: envelope({ id: 600 }) }));
    const opts = { fetchImpl: up.impl, now };
    await m.fetchSportmonksCached('football/leagues/600', {}, opts);
    h.clock.t += 3600_000;
    const r = await m.fetchSportmonksCached('football/leagues/600', {}, opts);
    expect(m.sportmonksCacheControl(r)).toBe(`public, s-maxage=${86400 - 3600}, stale-while-revalidate=${86400 * 3}`);
  });

  it('CDN başlığı: canlı veri (inplay) en çok 15 + 5 sn', async () => {
    const up = upstream(() => ({ status: 200, body: envelope([]) }));
    const r = await m.fetchSportmonksCached('football/livescores/inplay', {}, { fetchImpl: up.impl, now });
    expect(m.sportmonksCacheControl(r)).toBe('public, s-maxage=15, stale-while-revalidate=5');
  });

  it('anahtar ve kilit ortam + şema sürümü önekli; yerel (dev) prod kaydını görmez', async () => {
    const key = m.buildSportmonksCacheKey('football/leagues/600', { include: 'seasons' });
    expect(key).toBe('dev:v2:smc:football/leagues/600?include=seasons');

    const up = upstream(() => ({ status: 200, body: envelope({ id: 600 }) }));
    const original = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = 'production';
      await m.fetchSportmonksCached('football/leagues/600', { include: 'seasons' }, { fetchImpl: up.impl, now });
      expect([...h.redis!.store.keys()]).toContain('prod:v2:smc:football/leagues/600?include=seasons');
      delete process.env.VERCEL_ENV;
      const local = await (await freshModule()).fetchSportmonksCached('football/leagues/600', { include: 'seasons' }, { fetchImpl: up.impl, now });
      expect(local.cache).toBe('MISS'); // prod kaydı yerelden okunmadı
      expect(up.calls).toHaveLength(2);
    } finally {
      if (original === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = original;
    }
  });

  it('kilit anahtarı da önekli', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const up = upstream(async () => {
      await gate;
      return { status: 200, body: envelope([]) };
    });
    const p = m.fetchSportmonksCached('football/standings/seasons/9', {}, { fetchImpl: up.impl, now });
    await new Promise((r) => setTimeout(r, 20));
    expect([...h.redis!.store.keys()]).toContain('dev:v2:smc-lock:football/standings/seasons/9?');
    release();
    await p;
    expect([...h.redis!.store.keys()]).not.toContain('dev:v2:smc-lock:football/standings/seasons/9?');
  });

  it('anahtar: query sırası ve api_token fark etmez', () => {
    expect(m.buildSportmonksCacheKey('football/x', { b: '2', a: '1', api_token: 't' })).toBe(
      m.buildSportmonksCacheKey('/football/x/', { a: '1', b: '2' }),
    );
  });
});
