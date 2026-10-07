import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ configured: true, down: false, hits: 0 }));
vi.mock('./redis', () => ({
  REDIS_COMMAND_TIMEOUT_MS: 1000,
  getRedisClient: () => (h.configured ? {} : null),
  withRedis: async <T,>(fn: () => Promise<T>, fallback: T) => (h.down ? fallback : fn()),
}));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static fixedWindow() {
      return {};
    }
    async limit() {
      h.hits++;
      return { success: true, remaining: 1, reset: Date.now() + 1000 };
    }
  },
}));

import { hitFixedWindowRateLimit } from './rateLimit';

describe('hız sınırı — Redis kesintisi davranışı', () => {
  beforeEach(() => {
    h.configured = true;
    h.down = true;
    h.hits = 0;
  });

  it('varsayılan fail-open: kesintide istek engellenmez', async () => {
    for (let i = 0; i < 5; i++) expect((await hitFixedWindowRateLimit('k:open', 2, 60_000)).success).toBe(true);
  });

  it('failClosed: kesintide reddedilir', async () => {
    expect((await hitFixedWindowRateLimit('k:closed', 2, 60_000, { failClosed: true })).success).toBe(false);
  });

  it('memoryFallback: kesintide instance içi sayaç — sınır yine uygulanır (LLM uçları sınırsız kalmaz)', async () => {
    expect((await hitFixedWindowRateLimit('k:mem', 2, 60_000, { memoryFallback: true })).success).toBe(true);
    expect((await hitFixedWindowRateLimit('k:mem', 2, 60_000, { memoryFallback: true })).success).toBe(true);
    expect(await hitFixedWindowRateLimit('k:mem', 2, 60_000, { memoryFallback: true })).toMatchObject({ success: false, remaining: 0 });
    // Başka anahtar etkilenmez; failClosed öncelikli.
    expect((await hitFixedWindowRateLimit('k:mem2', 2, 60_000, { memoryFallback: true })).success).toBe(true);
    expect((await hitFixedWindowRateLimit('k:mem2', 2, 60_000, { memoryFallback: true, failClosed: true })).success).toBe(false);
  });

  it('Redis ayakta: Upstash sayacı kullanılır', async () => {
    h.down = false;
    expect((await hitFixedWindowRateLimit('k:up', 2, 60_000, { memoryFallback: true })).success).toBe(true);
    expect(h.hits).toBe(1);
  });
});
