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

/** Cevap vermeyen upstream: yalnız iptal sinyaliyle (AbortController) düşer. */
function hangingUpstream() {
  const signals: AbortSignal[] = [];
  const impl = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signals.push(signal);
          signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }
      }),
  ) as unknown as typeof fetch;
  return { impl, signals };
}

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
    expect(up.calls[0]).not.toContain('api_token');
    expect(up.calls[0]).not.toContain('test-token');
    expect(up.calls[0]).not.toContain('from-browser');
    expect(a.body).toEqual({ data: [] });
    expect(h.quota).toHaveBeenCalledTimes(1);
    expect(h.quota.mock.calls[0]![0]).toMatchObject({ pool: 'Fixture', remaining: 2400, path: '/football/livescores/inplay', origin: 'proxy' });
  });

  it('istek izleme: kapsamdaki çağrı ve upstream sayısı (kota raporu)', async () => {
    const up = upstream(() => ({ status: 200, body: envelope([]) }));
    const r = await m.trackSportmonksFetches(async () => {
      await m.fetchSportmonksCached('football/fixtures/1', {}, { fetchImpl: up.impl, now });
      await m.fetchSportmonksCached('football/fixtures/1', {}, { fetchImpl: up.impl, now });
      await m.fetchSportmonksCached('football/fixtures/2', {}, { fetchImpl: up.impl, now });
    });
    expect(r).toMatchObject({ calls: 3, upstream: 2, stale: false, failed: false });
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

  describe('"veriler gecikmeli" yalnız gerçek upstream hatasında (istek izleme)', () => {
    /** Redis'te süresi dolmuş (ama eski-veri penceresinde) kayıt bırakır. */
    async function seedExpired(path: string) {
      const up = upstream(() => ({ status: 200, body: envelope([{ id: 1 }]) }));
      await m.fetchSportmonksCached(path, {}, { fetchImpl: up.impl, now });
      h.clock.t += 21_000; // canlı skor 20 sn'lik taze süre doldu
    }

    it('eşzamanlı tazeleme: kilide takılan 5 instance eski kaydı alır, istek "gecikmeli" sayılmaz; CDN/proxy davranışı aynı', async () => {
      const path = 'football/livescores/inplay';
      await seedExpired(path);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const owner = upstream(async () => {
        await gate;
        return { status: 200, body: envelope([{ id: 2 }]) };
      });
      const others = upstream(() => ({ status: 200, body: envelope([{ id: 3 }]) }));

      const ownerInstance = await freshModule();
      const pOwner = ownerInstance.trackSportmonksFetches(() => ownerInstance.fetchSportmonksCached(path, {}, { fetchImpl: owner.impl, now }));
      await new Promise((r) => setTimeout(r, 20)); // sahibi kilidi alsın
      const waiting = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const inst = await freshModule(); // ayrı L1 / in-flight, aynı Redis (canlıdaki ayrı Vercel instance'ları)
          return inst.trackSportmonksFetches(() => inst.fetchSportmonksCached(path, {}, { fetchImpl: others.impl, now }));
        }),
      );
      release();
      const ownerResult = await pOwner;

      expect(others.calls).toHaveLength(0); // upstream'e yalnız kilit sahibi gitti
      for (const w of waiting) {
        expect(w.stale).toBe(false);
        expect(w.failed).toBe(false);
        // Sonucun kendisi değişmedi: eski kayıt, kısa CDN süresi (proxy `X-Data-Stale` da aynı)
        expect(w.value.stale).toBe(true);
        expect(w.value.concurrentRefresh).toBe(true);
        expect(w.value.body).toEqual({ data: [{ id: 1 }] });
        expect(m.sportmonksCacheControl(w.value)).toBe('public, s-maxage=15, stale-while-revalidate=60');
      }
      expect(ownerResult.stale).toBe(false);
      expect(ownerResult.value.body).toEqual({ data: [{ id: 2 }] });
    });

    for (const [label, respond] of [
      ['429', () => ({ status: 429, body: { message: 'Too Many Attempts.' } })],
      ['5xx', () => ({ status: 503, body: { message: 'Service Unavailable' } })],
    ] as const) {
      it(`gerçek hata (${label}) + eski kayıt → "gecikmeli"`, async () => {
        const path = 'football/livescores/inplay';
        await seedExpired(path);
        const other = await freshModule();
        const up = upstream(respond);
        const r = await other.trackSportmonksFetches(() => other.fetchSportmonksCached(path, {}, { fetchImpl: up.impl, now }));
        expect(up.calls).toHaveLength(1);
        expect(r.stale).toBe(true);
        expect(r.value.stale).toBe(true);
        expect(r.value.concurrentRefresh).toBeUndefined();
      });
    }

    it('ağ hatası + eski kayıt → "gecikmeli"', async () => {
      const path = 'football/livescores/inplay';
      await seedExpired(path);
      const other = await freshModule();
      const impl = vi.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch;
      const r = await other.trackSportmonksFetches(() => other.fetchSportmonksCached(path, {}, { fetchImpl: impl, now }));
      expect(r.stale).toBe(true);
      expect(r.value.concurrentRefresh).toBeUndefined();
    });

    it('zaman aşımı + eski kayıt → "gecikmeli"', async () => {
      const path = 'football/livescores/inplay';
      await seedExpired(path);
      const other = await freshModule();
      const up = hangingUpstream();
      const r = await other.trackSportmonksFetches(() =>
        other.fetchSportmonksCached(path, {}, { fetchImpl: up.impl, now, timeoutMs: 50 }),
      );
      expect(up.signals[0]?.aborted).toBe(true);
      expect(r.stale).toBe(true);
      expect(r.value.concurrentRefresh).toBeUndefined();
    });
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

  it('anahtar: dizi parametre ile virgüllü değer çakışmaz; değerdeki & = % kaçışlı (zehirleme yok)', () => {
    const k = (q: Record<string, string | string[]>) => m.buildSportmonksCacheKey('football/x', q);
    expect(k({ include: ['a', 'b'] })).not.toBe(k({ include: 'a,b' }));
    expect(k({ include: ['b', 'a'] })).not.toBe(k({ include: ['a', 'b'] }));
    expect(k({ include: 'a&include=b' })).not.toBe(k({ include: ['a', 'b'] }));
    // kaçış gerektirmeyen değerlerde biçim eskisiyle aynı (canlı önbellek korunur)
    expect(k({ include: 'participants;scores', filters: 'fixtureLeagues:2' })).toMatch(
      /football\/x\?filters=fixtureLeagues:2&include=participants;scores$/,
    );
  });

  it('upstream sorgusu anahtarla aynı sırada ve aynı çiftlerle gider', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await m.fetchSportmonksCached('football/teams/34', { page: '1', include: ['b', 'a'], api_token: 'x' }, { fetchImpl });
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect([...url.searchParams.entries()]).toEqual([
      ['include', 'b'],
      ['include', 'a'],
      ['page', '1'],
    ]);
  });

  it('token URL\'de değil Authorization başlığında gider (Bearer\'sız); önbellek anahtarı ve yanıt aynı (güvenlik raporu Y1)', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(envelope({ id: 600 })), { status: 200 }),
    );
    const q = { include: 'seasons', api_token: 'from-browser' };
    const r = await m.fetchSportmonksCached('football/leagues/600', q, { fetchImpl: fetchImpl as unknown as typeof fetch, now });
    const [input, init] = fetchImpl.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.href).toBe('https://api.sportmonks.com/v3/football/leagues/600?include=seasons');
    expect(url.searchParams.has('api_token')).toBe(false);
    expect(String(input)).not.toContain('test-token');
    expect(new Headers(init?.headers).get('authorization')).toBe('test-token');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    // anahtar biçimi değişmedi (canlı Redis önbelleği geçersiz kalmaz)
    expect([...h.redis!.store.keys()]).toContain('dev:v2:smc:football/leagues/600?include=seasons');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: { id: 600 } });
  });

  it.each(['football/teams/search/x?include=odds', 'football/../odds', 'football/teams/search/x#y', 'football/%2e%2e/odds', 'a\\b'])(
    'güvensiz yol upstream\'e gitmez: %s',
    async (p) => {
      const fetchImpl = vi.fn();
      await expect(m.fetchSportmonksCached(p, {}, { fetchImpl })).rejects.toThrow('Geçersiz Sportmonks yolu');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('sunucu içi yüzde-kodlu arama yolu geçerli', () => {
    expect(m.isSafeSportmonksPath('football/teams/search/fenerbah%C3%A7e%20spor')).toBe(true);
    expect(m.isSafeSportmonksPath('football/fixtures/multi/1,2,3')).toBe(true);
  });

  describe('zaman aşımı', () => {
    it('bütçeler: sayfa render\'ı 3 sn, API / cron 5 sn', () => {
      expect(m.SPORTMONKS_TIMEOUT_MS).toEqual({ page: 3_000, api: 5_000 });
    });

    it('cevap gelmezse istek iptal edilir → 504, cache\'lenmez, istek "başarısız" sayılır', async () => {
      const up = hangingUpstream();
      const tracked = await m.trackSportmonksFetches(() =>
        m.fetchSportmonksCached('football/fixtures/19745050', {}, { fetchImpl: up.impl, now, timeoutMs: 30 }),
      );
      const r = tracked.value;
      expect(up.signals).toHaveLength(1);
      expect(up.signals[0]!.aborted).toBe(true);
      expect(r.status).toBe(504);
      expect(r.cache).toBe('BYPASS');
      expect(m.sportmonksCacheControl(r)).toBe('no-store');
      expect(tracked.failed).toBe(true);

      // Negatif cache'e girmedi: sonraki istek yine upstream'e gider.
      const ok = upstream(() => ({ status: 200, body: envelope({ id: 19745050 }) }));
      const again = await m.fetchSportmonksCached('football/fixtures/19745050', {}, { fetchImpl: ok.impl, now });
      expect(again.status).toBe(200);
      expect(ok.calls).toHaveLength(1);
    });

    it('zaman aşımında son geçerli veri varsa o verilir (stale)', async () => {
      const ok = upstream(() => ({ status: 200, body: envelope([{ id: 7 }]) }));
      await m.fetchSportmonksCached('football/standings/seasons/1', {}, { fetchImpl: ok.impl, now });

      const other = await freshModule(); // Redis'te eski kayıt var
      h.clock.t += 11 * 60_000; // taze süre doldu
      const up = hangingUpstream();
      const r = await other.fetchSportmonksCached('football/standings/seasons/1', {}, { fetchImpl: up.impl, now, timeoutMs: 30 });

      expect(up.signals[0]!.aborted).toBe(true);
      expect(r.stale).toBe(true);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ data: [{ id: 7 }] });
    });

    it('withSportmonksTimeout kapsamı içindeki tüm çağrılara uygulanır; dışında varsayılan (api) bütçe', async () => {
      const slow = (ms: number) =>
        vi.fn(
          (_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((resolve, reject) => {
              const timer = setTimeout(() => resolve(new Response(JSON.stringify(envelope([{ id: 1 }])), { status: 200 })), ms);
              init?.signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }),
        ) as unknown as typeof fetch;

      const scoped = await m.withSportmonksTimeout(20, () =>
        m.fetchSportmonksCached('football/leagues/600', {}, { fetchImpl: slow(150), now }),
      );
      expect(scoped.status).toBe(504);

      const unscoped = await m.fetchSportmonksCached('football/leagues/601', {}, { fetchImpl: slow(150), now });
      expect(unscoped.status).toBe(200);
    });

    it('kilit beklemesi de bütçeden düşer: bütçe biterse upstream\'e hiç gidilmez', async () => {
      const up = hangingUpstream();
      const other = await freshModule();
      // A kilidi alır ve cevapsız kalır.
      const pa = m.fetchSportmonksCached('football/standings/seasons/3', {}, { fetchImpl: up.impl, now, timeoutMs: 400 });
      await new Promise((r) => setTimeout(r, 20));

      const upB = upstream(() => ({ status: 200, body: envelope([{ id: 3 }]) }));
      const started = Date.now();
      const rb = await other.fetchSportmonksCached('football/standings/seasons/3', {}, { fetchImpl: upB.impl, now: Date.now, timeoutMs: 60 });
      expect(Date.now() - started).toBeLessThan(300);
      expect(rb.status).toBe(504);
      expect(upB.calls).toHaveLength(0);

      expect((await pa).status).toBe(504);
    });
  });
});
