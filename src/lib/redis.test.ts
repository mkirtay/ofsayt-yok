import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };

describe('withRedis — zaman aşımı/hata → yedek değer, devre kesici', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-09-30T12:00:00Z'));
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 't';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = ORIGINAL.url;
    process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL.token;
    if (ORIGINAL.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    if (ORIGINAL.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('Redis tanımlı değilse komutu hiç çalıştırmadan yedek değeri döner', async () => {
    process.env.UPSTASH_REDIS_REST_URL = '';
    const { withRedis } = await import('./redis');
    const fn = vi.fn(async () => 'x');
    expect(await withRedis(fn, 'yedek')).toBe('yedek');
    expect(fn).not.toHaveBeenCalled();
  });

  it('hata/zaman aşımında fırlatmaz, yedek değeri döner', async () => {
    const { withRedis } = await import('./redis');
    expect(await withRedis(async () => Promise.reject(new Error('TimeoutError')), null)).toBeNull();
    expect(await withRedis(async () => 'ok', null)).toBe('ok');
  });

  it('art arda 3 hatadan sonra 30 sn hiç denemez, sonra tekrar dener', async () => {
    const { withRedis, isRedisBypassed, REDIS_BYPASS_MS } = await import('./redis');
    const failing = vi.fn(async () => {
      throw new Error('down');
    });
    for (let i = 0; i < 3; i++) await withRedis(failing, null);
    expect(failing).toHaveBeenCalledTimes(3);
    expect(isRedisBypassed()).toBe(true);

    const probe = vi.fn(async () => 'ok');
    expect(await withRedis(probe, 'yedek')).toBe('yedek');
    expect(probe).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + REDIS_BYPASS_MS + 1);
    expect(await withRedis(probe, 'yedek')).toBe('ok');
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('başarı ardışık hata sayacını sıfırlar (aralıklı tek hata devreyi açmaz)', async () => {
    const { withRedis, isRedisBypassed } = await import('./redis');
    const fail = async () => Promise.reject(new Error('x'));
    await withRedis(fail, null);
    await withRedis(fail, null);
    await withRedis(async () => 1, 0);
    await withRedis(fail, null);
    expect(isRedisBypassed()).toBe(false);
  });

  it('istemci: 1 yeniden deneme + komut başına ~1 sn zaman aşımı', async () => {
    const { getRedisClient } = await import('./redis');
    const client = getRedisClient() as unknown as { client: { retry: { attempts: number }; options: { signal?: unknown } } };
    expect(client.client.retry.attempts).toBe(1);
    expect(typeof client.client.options.signal).toBe('function');
  });
});

describe('hitFixedWindowRateLimit — Redis cevap vermezse fail-open', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 't';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.doUnmock('@upstash/ratelimit');
    vi.restoreAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = ORIGINAL.url;
    process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL.token;
    if (ORIGINAL.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    if (ORIGINAL.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('limit() hata verirse istek engellenmez', async () => {
    vi.doMock('@upstash/ratelimit', () => {
      class Ratelimit {
        static fixedWindow() {
          return {};
        }
        async limit() {
          throw new Error('fetch failed');
        }
      }
      return { Ratelimit };
    });
    const { hitFixedWindowRateLimit } = await import('./rateLimit');
    for (let i = 0; i < 5; i++) {
      expect((await hitFixedWindowRateLimit('k', 1, 60_000)).success).toBe(true);
    }
  });
});
