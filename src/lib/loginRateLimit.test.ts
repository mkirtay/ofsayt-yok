import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };

function restoreEnv() {
  if (ORIGINAL.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = ORIGINAL.url;
  if (ORIGINAL.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL.token;
}

describe('web şifreli giriş sınırı (IP + hesap)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = ''; // instance içi sayaç
  });
  afterEach(restoreEnv);

  it('aynı IP + hesap: 10 deneme, 11. reddedilir; büyük/küçük harf aynı sayaç', async () => {
    const { hitLoginRateLimit, LOGIN_PER_ACCOUNT_LIMIT } = await import('./loginRateLimit');
    for (let i = 0; i < LOGIN_PER_ACCOUNT_LIMIT; i++) {
      expect((await hitLoginRateLimit('1.1.1.1', i % 2 ? 'Ali@x.com' : 'ali@x.com ')).success).toBe(true);
    }
    expect((await hitLoginRateLimit('1.1.1.1', 'ali@x.com')).success).toBe(false);
    // başka IP'den aynı hesap etkilenmez (kurbanın girişi kilitlenmez)
    expect((await hitLoginRateLimit('2.2.2.2', 'ali@x.com')).success).toBe(true);
  });

  it('aynı IP farklı hesaplar (parola püskürtme): 30 denemeden sonra reddedilir', async () => {
    const { hitLoginRateLimit, LOGIN_PER_IP_LIMIT } = await import('./loginRateLimit');
    for (let i = 0; i < LOGIN_PER_IP_LIMIT; i++) {
      expect((await hitLoginRateLimit('3.3.3.3', `u${i}@x.com`)).success).toBe(true);
    }
    expect((await hitLoginRateLimit('3.3.3.3', 'yeni@x.com')).success).toBe(false);
  });

  it('yalnız POST /api/auth/callback/credentials', async () => {
    const { isCredentialsCallback } = await import('./loginRateLimit');
    expect(isCredentialsCallback('POST', ['callback', 'credentials'])).toBe(true);
    expect(isCredentialsCallback('GET', ['callback', 'credentials'])).toBe(false);
    expect(isCredentialsCallback('POST', ['callback', 'google'])).toBe(false);
    expect(isCredentialsCallback('POST', ['session'])).toBe(false);
  });
});

describe('Redis hatasında kimlik uçları reddeder (fail-closed)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 't';
    vi.doMock('./redis', async (orig) => ({
      ...(await orig<typeof import('./redis')>()),
      withRedis: async <T,>(_fn: unknown, fallback: T) => fallback, // Redis cevap vermiyor
    }));
  });
  afterEach(() => {
    vi.doUnmock('./redis');
    restoreEnv();
  });

  it('varsayılan fail-open, failClosed reddeder; giriş sınırı fail-closed', async () => {
    const { hitFixedWindowRateLimit } = await import('./rateLimit');
    expect((await hitFixedWindowRateLimit('x', 5, 60_000)).success).toBe(true);
    expect((await hitFixedWindowRateLimit('x', 5, 60_000, { failClosed: true })).success).toBe(false);
    const { hitLoginRateLimit } = await import('./loginRateLimit');
    expect((await hitLoginRateLimit('1.1.1.1', 'a@b.c')).success).toBe(false);
  });
});
