import { describe, expect, it, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/redis', () => ({
  withRedis: async <T,>(fn: (r: unknown) => Promise<T>) =>
    fn({
      set: async (k: string, v: string, o: { nx?: boolean }) => {
        if (o.nx && store.has(k)) return null;
        store.set(k, v);
        return 'OK';
      },
      get: async (k: string) => store.get(k) ?? null,
      del: async (k: string) => store.delete(k),
    }),
}));
vi.mock('@/lib/cacheNamespace', () => ({ cacheKeyPrefix: () => 'test:v2:' }));

import { acquireAnalysisLock, releaseAnalysisLock } from './analysisGenerationLock';

describe('analiz üretim kilidi', () => {
  beforeEach(() => store.clear());

  it('aynı maç için ikinci istek kilidi alamaz; bırakılınca yeniden alınır', async () => {
    const a = await acquireAnalysisLock('123');
    expect(a?.key).toBe('test:v2:analysis-gen:123');
    expect(await acquireAnalysisLock('123')).toBeNull();
    expect(await acquireAnalysisLock('456')).not.toBeNull();
    await releaseAnalysisLock(a);
    expect(await acquireAnalysisLock('123')).not.toBeNull();
  });

  it('başkasının kilidini (süresi dolup yeniden alınmış) silmez', async () => {
    const a = await acquireAnalysisLock('123');
    store.set(a!.key, 'baskasi');
    await releaseAnalysisLock(a);
    expect(store.get(a!.key)).toBe('baskasi');
  });
});
