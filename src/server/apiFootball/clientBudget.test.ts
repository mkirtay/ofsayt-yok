import { beforeEach, describe, expect, it, vi } from 'vitest';

/** İç bütçe havuzları: kombine aracı milli maç sayacını yemez ve ondan etkilenmez. */
const counters = vi.hoisted(() => new Map<string, number>());
vi.mock('@/lib/redis', () => ({
  withRedis: async (fn: (r: unknown) => unknown) =>
    fn({
      incr: async (k: string) => {
        counters.set(k, (counters.get(k) ?? 0) + 1);
        return counters.get(k);
      },
      expire: async () => 1,
    }),
}));
vi.mock('@/lib/cacheNamespace', () => ({ cacheKeyPrefix: () => 'p:' }));

import { ANALYSIS_DAILY_LIMIT, apiFootballGet, ApiFootballError, COMBO_DAILY_LIMIT, DAILY_SOFT_LIMIT } from './client';

const ok = (async () => new Response(JSON.stringify({ response: [], errors: [] }), { status: 200 })) as unknown as typeof fetch;

describe('apiFootballGet bütçe havuzları', () => {
  beforeEach(() => {
    counters.clear();
    vi.stubEnv('API_FOOTBALL_KEY', 'k');
  });

  it('varsayılan (milli) ve combo ayrı sayaçlar', async () => {
    await apiFootballGet('/fixtures', {}, ok);
    await apiFootballGet('/odds', {}, ok, 'combo');
    await apiFootballGet('/odds', {}, ok, 'combo');
    const keys = [...counters.entries()];
    expect(keys.filter(([k]) => k.includes(':combo:')).map(([, v]) => v)).toEqual([2]);
    expect(keys.filter(([k]) => !k.includes(':combo:')).map(([, v]) => v)).toEqual([1]);
  });

  it('combo havuzu dolunca yalnız combo reddedilir; milli devam eder', async () => {
    const day = new Date().toISOString().slice(0, 10);
    counters.set(`p:af:daily:combo:${day}`, COMBO_DAILY_LIMIT);
    await expect(apiFootballGet('/odds', {}, ok, 'combo')).rejects.toMatchObject({ kind: 'budget' });
    await expect(apiFootballGet('/fixtures', {}, ok)).resolves.toBeDefined();
  });

  it('milli havuz dolunca combo etkilenmez; toplam pay Pro limitinin altında', async () => {
    const day = new Date().toISOString().slice(0, 10);
    counters.set(`p:af:daily:${day}`, DAILY_SOFT_LIMIT);
    await expect(apiFootballGet('/fixtures', {}, ok)).rejects.toBeInstanceOf(ApiFootballError);
    await expect(apiFootballGet('/odds', {}, ok, 'combo')).resolves.toBeDefined();
    expect(DAILY_SOFT_LIMIT + COMBO_DAILY_LIMIT).toBeLessThan(7500);
  });

  it('analiz havuzu ayrı sayaç; dolunca yalnız o reddedilir, toplam pay Pro limitini aşmaz', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await apiFootballGet('/fixtures', {}, ok, 'analysis');
    expect(counters.get(`p:af:daily:analysis:${day}`)).toBe(1);
    expect(counters.get(`p:af:daily:${day}`)).toBeUndefined();
    counters.set(`p:af:daily:analysis:${day}`, ANALYSIS_DAILY_LIMIT);
    await expect(apiFootballGet('/fixtures', {}, ok, 'analysis')).rejects.toMatchObject({ kind: 'budget' });
    await expect(apiFootballGet('/fixtures', {}, ok)).resolves.toBeDefined();
    expect(DAILY_SOFT_LIMIT + COMBO_DAILY_LIMIT + ANALYSIS_DAILY_LIMIT).toBeLessThanOrEqual(7500);
  });
});
