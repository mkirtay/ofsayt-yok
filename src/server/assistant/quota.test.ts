import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ configured: true, down: false, store: new Map<string, number>() }));
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => (h.configured ? {} : null),
  withRedis: async <T,>(fn: (r: unknown) => Promise<T>, fallback: T) => {
    if (!h.configured || h.down) return fallback;
    return fn({
      get: async (k: string) => h.store.get(k) ?? null,
      incrby: async (k: string, by: number) => h.store.set(k, (h.store.get(k) ?? 0) + by),
      expire: async () => 1,
    });
  },
}));
vi.mock('@/lib/cacheNamespace', () => ({ cacheKeyPrefix: () => 't:' }));

import { ASSISTANT_DAILY_BUDGET_MICRO_USD, ASSISTANT_DAILY_LIMIT, checkAssistantQuota, guestIpKey, recordAssistantUsage, resetAssistantQuotaMemoryForTests } from './quota';

const DAY = '2026-10-06';

describe('asistan günlük kotası', () => {
  beforeEach(() => {
    h.configured = true;
    h.down = false;
    h.store.clear();
    resetAssistantQuotaMemoryForTests();
  });

  it('sınırlar: misafir 3, üye 15, premium 50', () => {
    expect(ASSISTANT_DAILY_LIMIT).toEqual({ guest: 3, user: 15, premium: 50 });
  });

  it('misafir: IP ya da çerez anahtarından biri dolunca kapanır', async () => {
    const keys = ['ip:a', 'c:1'];
    for (let i = 0; i < 3; i++) {
      expect((await checkAssistantQuota('guest', keys, DAY)).allowed).toBe(true);
      await recordAssistantUsage(keys, 100, DAY);
    }
    expect(await checkAssistantQuota('guest', keys, DAY)).toMatchObject({ allowed: false, reason: 'QUOTA' });
    // Çerezi silen misafir: IP anahtarı hâlâ dolu.
    expect((await checkAssistantQuota('guest', ['ip:a', 'c:yeni'], DAY)).allowed).toBe(false);
    // Ertesi gün sıfırlanır.
    expect(await checkAssistantQuota('guest', keys, '2026-10-07')).toMatchObject({ allowed: true, remaining: 3 });
  });

  it('üye 15, premium 50; kalan hak döner', async () => {
    for (let i = 0; i < 15; i++) await recordAssistantUsage(['u:1'], 0, DAY);
    expect((await checkAssistantQuota('user', ['u:1'], DAY)).allowed).toBe(false);
    expect(await checkAssistantQuota('premium', ['u:1'], DAY)).toMatchObject({ allowed: true, remaining: 35, limit: 50 });
  });

  it('Redis kesintisi: misafir KAPALI, üye instance içi sayaçla devam eder', async () => {
    h.down = true;
    expect(await checkAssistantQuota('guest', ['ip:a', 'c:1'], DAY)).toMatchObject({ allowed: false, reason: 'UNAVAILABLE' });
    expect((await checkAssistantQuota('user', ['u:1'], DAY)).allowed).toBe(true);
    for (let i = 0; i < 15; i++) await recordAssistantUsage(['u:1'], 0, DAY);
    expect(await checkAssistantQuota('user', ['u:1'], DAY)).toMatchObject({ allowed: false, reason: 'QUOTA' });
  });

  it('Redis hiç tanımlı değilse (yerel) instance içi çalışır', async () => {
    h.configured = false;
    expect((await checkAssistantQuota('guest', ['ip:a', 'c:1'], DAY)).allowed).toBe(true);
  });

  it('global bütçe 5 USD: aşılınca herkese kapalı (premium dahil)', async () => {
    expect(ASSISTANT_DAILY_BUDGET_MICRO_USD).toBe(5_000_000);
    await recordAssistantUsage(['u:1'], 4_999_999, DAY);
    expect((await checkAssistantQuota('premium', ['u:2'], DAY)).allowed).toBe(true);
    await recordAssistantUsage(['u:1'], 1, DAY);
    expect(await checkAssistantQuota('premium', ['u:2'], DAY)).toMatchObject({ allowed: false, reason: 'BUDGET' });
    expect(await checkAssistantQuota('guest', ['ip:x', 'c:x'], DAY)).toMatchObject({ allowed: false, reason: 'BUDGET' });
  });

  it('misafir IP anahtarı: /24 özeti, ham IP içermez', () => {
    expect(guestIpKey('85.100.20.7', 's')).toBe(guestIpKey('85.100.20.250', 's'));
    expect(guestIpKey('85.100.21.7', 's')).not.toBe(guestIpKey('85.100.20.7', 's'));
    expect(guestIpKey('85.100.20.7', 's')).not.toContain('85.100');
  });
});
