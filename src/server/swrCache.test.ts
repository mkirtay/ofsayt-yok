import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeRedis, type FakeRedis } from './sportmonks/fakeRedis.testutil';

const h = vi.hoisted(() => ({ redis: null as FakeRedis | null, t: 1_000_000 }));
vi.mock('@/lib/redis', async (orig) => ({
  fitsInRedis: (await orig<typeof import('@/lib/redis')>()).fitsInRedis,
  getRedisClient: () => h.redis,
  withRedis: async <T,>(fn: (r: FakeRedis) => Promise<T>, fallback: T) => (h.redis ? fn(h.redis) : fallback),
}));

import { loadWithSwr } from './swrCache';

const now = () => h.t;
const flush = () => new Promise((r) => setTimeout(r, 20));

describe('loadWithSwr (stale-while-revalidate + kilit)', () => {
  beforeEach(() => {
    h.t = 1_000_000;
    h.redis = createFakeRedis(now);
  });

  it('değer yok → eşzamanlı üretim; taze → üretim yok', async () => {
    const compute = vi.fn(async () => ({ n: 1 }));
    expect(await loadWithSwr('k', { freshSeconds: 60, now }, compute)).toEqual({ value: { n: 1 }, state: 'computed' });
    h.t += 30_000;
    expect(await loadWithSwr('k', { freshSeconds: 60, now }, compute)).toEqual({ value: { n: 1 }, state: 'fresh' });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('eski → eski değer HEMEN; yenisi arka planda TEK kez (eşzamanlı istekler kilide takılır)', async () => {
    let n = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const compute = vi.fn(async () => {
      n += 1;
      if (n > 1) await gate;
      return { n };
    });
    await loadWithSwr('k', { freshSeconds: 60, now }, compute); // n=1 yazıldı
    h.t += 61_000;
    const results = await Promise.all([1, 2, 3].map(() => loadWithSwr('k', { freshSeconds: 60, now }, compute)));
    expect(results.map((r) => [r!.state, (r!.value as { n: number }).n])).toEqual([['stale', 1], ['stale', 1], ['stale', 1]]);
    release();
    await flush();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(await loadWithSwr('k', { freshSeconds: 60, now }, compute)).toEqual({ value: { n: 2 }, state: 'fresh' });
  });

  it('yenileme hata verirse (null) eski değer kalır', async () => {
    await loadWithSwr('k', { freshSeconds: 60, now }, async () => 'eski');
    h.t += 61_000;
    expect((await loadWithSwr('k', { freshSeconds: 60, now }, async () => null))!.value).toBe('eski');
    await flush();
    expect((await loadWithSwr('k', { freshSeconds: 60, now }, async () => 'x'))!.value).toBe('eski'); // hâlâ eski (bayat)
  });

  it('değer yokken kilit başkasındaysa onun yazmasını bekler (ikinci üretim yok)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = vi.fn(async () => {
      await gate;
      return 'v';
    });
    const p1 = loadWithSwr('k', { freshSeconds: 60 }, slow);
    await flush();
    const second = vi.fn(async () => 'ikinci');
    const p2 = loadWithSwr('k', { freshSeconds: 60, waitMs: 2_000 }, second);
    await flush();
    release();
    expect((await p1)!.value).toBe('v');
    expect((await p2)!.value).toBe('v');
    expect(second).not.toHaveBeenCalled();
  });

  it('Redis yoksa her seferinde üretir', async () => {
    h.redis = null;
    const compute = vi.fn(async () => 1);
    await loadWithSwr('k', { freshSeconds: 60, now }, compute);
    await loadWithSwr('k', { freshSeconds: 60, now }, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe('loadWithSwr — boyut koruması', () => {
  beforeEach(() => {
    h.t = 1_000_000;
    h.redis = createFakeRedis(now);
  });

  it('Redis sınırını aşan değer yazılmaz (istek yine değer alır, 500 yok)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const huge = 'x'.repeat(1_000_000);
    const r = await loadWithSwr('big', { freshSeconds: 60, now }, async () => huge);
    expect(r).toEqual({ value: huge, state: 'computed' });
    expect(h.redis!.store.has('big')).toBe(false);
  });
});

describe('peekSwr', () => {
  it('yalnız okur: değer varsa (taze ya da eski) döner, yoksa null; üretmez', async () => {
    const { peekSwr } = await import('./swrCache');
    h.redis = createFakeRedis(now);
    expect(await peekSwr('yok')).toBeNull();
    await loadWithSwr('t', { freshSeconds: 60, now }, async () => [1, 2]);
    h.t += 10 * 60_000;
    expect(await peekSwr('t')).toEqual([1, 2]);
  });
});
