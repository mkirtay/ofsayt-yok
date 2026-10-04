import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRedis, type FakeRedis } from '@/server/sportmonks/fakeRedis.testutil';

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  redis: null as FakeRedis | null,
  redisDown: false,
  t: 0,
}));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: h.findUnique } } }));
vi.mock('@/lib/redis', () => ({
  withRedis: async <T,>(fn: (r: FakeRedis) => Promise<T>, fallback: T) => {
    if (!h.redis || h.redisDown) return fallback;
    return fn(h.redis);
  },
}));

import { getSessionVersion, invalidateSessionVersion, SESSION_VERSION_TTL_SEC } from './sessionVersion';
import { cacheKeyPrefix } from './cacheNamespace';

beforeEach(() => {
  h.t = Date.parse('2026-10-05T10:00:00Z');
  h.redis = createFakeRedis(() => h.t);
  h.redisDown = false;
  h.findUnique.mockReset().mockResolvedValue({ tokenVersion: 1, role: 'USER' });
});

describe('oturum sürümü önbelleği (Redis, 60 sn)', () => {
  it('ilk kontrol DB, sonrakiler 60 sn boyunca Redis; süre dolunca yine DB', async () => {
    expect(await getSessionVersion('u1')).toEqual({ tokenVersion: 1, role: 'USER' });
    expect(await getSessionVersion('u1')).toEqual({ tokenVersion: 1, role: 'USER' });
    expect(h.findUnique).toHaveBeenCalledTimes(1);
    h.t += (SESSION_VERSION_TTL_SEC + 1) * 1000;
    await getSessionVersion('u1');
    expect(h.findUnique).toHaveBeenCalledTimes(2);
  });

  it('şifre değişince anahtar silinir → yeni sürüm hemen görülür (60 sn beklemeden)', async () => {
    await getSessionVersion('u1');
    h.findUnique.mockResolvedValue({ tokenVersion: 2, role: 'USER' });
    expect((await getSessionVersion('u1'))!.tokenVersion).toBe(1); // önbellekte
    await invalidateSessionVersion('u1');
    expect((await getSessionVersion('u1'))!.tokenVersion).toBe(2);
  });

  it('Redis hatasında DB\'ye düşer (her kontrol DB)', async () => {
    h.redisDown = true;
    await getSessionVersion('u1');
    await getSessionVersion('u1');
    expect(h.findUnique).toHaveBeenCalledTimes(2);
    await expect(invalidateSessionVersion('u1')).resolves.toBeUndefined();
  });

  it('kullanıcı yoksa null (önbelleğe yazılmaz)', async () => {
    h.findUnique.mockResolvedValue(null);
    expect(await getSessionVersion('yok')).toBeNull();
    expect(h.redis!.store.size).toBe(0);
  });

  it('bozuk önbellek değeri yok sayılır', async () => {
    await h.redis!.set(`${cacheKeyPrefix()}session-version:u1`, { tokenVersion: 'x' });
    expect((await getSessionVersion('u1'))!.tokenVersion).toBe(1);
    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });
});
