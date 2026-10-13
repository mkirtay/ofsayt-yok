import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Günlük deneme sayacı: INCR atomik (eşzamanlı gönderimler ayrı sayı alır), anahtar gün + kullanıcıya özel, Redis yoksa null. */
const h = vi.hoisted(() => ({ store: new Map<string, number>(), ttl: new Map<string, number>(), down: false }));

vi.mock('@/lib/redis', () => {
  const redis = {
    pipeline() {
      const ops: (() => number)[] = [];
      const p = {
        incr(k: string) {
          ops.push(() => {
            const v = (h.store.get(k) ?? 0) + 1;
            h.store.set(k, v);
            return v;
          });
          return p;
        },
        expire(k: string, s: number) {
          ops.push(() => (h.ttl.set(k, s), 1));
          return p;
        },
        async exec() {
          return ops.map((op) => op());
        },
      };
      return p;
    },
    async get(k: string) {
      return h.store.get(k) ?? null;
    },
  };
  return {
    withRedis: async <T,>(fn: (r: typeof redis) => Promise<T>, fallback: T) => (h.down ? fallback : fn(redis)),
  };
});

import { FRIKIK_DAILY_ATTEMPTS, readAttempts, takeAttempt } from './attempts';

describe('frikik deneme sayacı', () => {
  beforeEach(() => {
    h.store.clear();
    h.ttl.clear();
    h.down = false;
  });

  it('tavan 5; eşzamanlı 6 gönderim 1..6 ayrı sayı alır (yalnız biri tavanı aşar)', async () => {
    expect(FRIKIK_DAILY_ATTEMPTS).toBe(5);
    const got = await Promise.all(Array.from({ length: 6 }, () => takeAttempt('u1', '2026-10-13')));
    expect([...got].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(got.filter((n) => n! > FRIKIK_DAILY_ATTEMPTS)).toHaveLength(1);
    expect(await readAttempts('u1', '2026-10-13')).toBe(6);
  });

  it('kullanıcı ve gün ayrı sayılır; anahtar 2 gün yaşar', async () => {
    await takeAttempt('u1', '2026-10-13');
    expect(await takeAttempt('u2', '2026-10-13')).toBe(1);
    expect(await takeAttempt('u1', '2026-10-14')).toBe(1);
    expect(await readAttempts('u3', '2026-10-13')).toBe(0);
    expect([...h.ttl.values()].every((s) => s === 172_800)).toBe(true);
  });

  it('Redis yoksa null (fail-open)', async () => {
    h.down = true;
    expect(await takeAttempt('u1', '2026-10-13')).toBeNull();
    expect(await readAttempts('u1', '2026-10-13')).toBeNull();
  });
});
