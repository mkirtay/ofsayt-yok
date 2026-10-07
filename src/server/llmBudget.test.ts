import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ configured: true, down: false, store: new Map<string, unknown>(), messages: [] as Array<{ msg: string; level?: string }> }));
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => (h.configured ? {} : null),
  withRedis: async <T,>(fn: (r: unknown) => Promise<T>, fallback: T) => {
    if (!h.configured || h.down) return fallback;
    await new Promise((r) => setTimeout(r, 1));
    return fn({
      incrby: async (k: string, by: number) => {
        const v = Number(h.store.get(k) ?? 0) + by;
        h.store.set(k, v);
        return v;
      },
      expire: async () => 1,
      get: async (k: string) => h.store.get(k) ?? null,
      set: async (k: string, v: unknown, o: { nx?: boolean } = {}) => {
        if (o.nx && h.store.has(k)) return null;
        h.store.set(k, v);
        return 'OK';
      },
    });
  },
}));
vi.mock('@/lib/cacheNamespace', () => ({ cacheKeyPrefix: () => 't:' }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: (msg: string, o: { level?: string }) => h.messages.push({ msg, level: o?.level }) }));

import {
  LLM_BUDGET_OUTAGE_SHARE,
  LLM_MONTHLY_BUDGET_USD_DEFAULT,
  llmMonthlyBudgetMicroUsd,
  readLlmBudget,
  reserveLlmBudget,
  resetLlmBudgetMemoryForTests,
  settleLlmBudget,
} from './llmBudget';
import { llmCostMicroUsd, llmPrice } from './llmCost';

const M = '2026-10';
const KEY = `t:llm:budget:${M}`;
const CAP = 10_000_000; // 10 USD

describe('aylık OpenAI bütçe sigortası', () => {
  beforeEach(() => {
    h.configured = true;
    h.down = false;
    h.store.clear();
    h.messages = [];
    resetLlmBudgetMemoryForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.OPENAI_MONTHLY_BUDGET_USD;
  });

  it('tavan env ile: OPENAI_MONTHLY_BUDGET_USD; geçersizse varsayılan 30 USD', () => {
    expect(llmMonthlyBudgetMicroUsd(undefined)).toBe(LLM_MONTHLY_BUDGET_USD_DEFAULT * 1_000_000);
    expect(llmMonthlyBudgetMicroUsd('12.5')).toBe(12_500_000);
    expect(llmMonthlyBudgetMicroUsd('0')).toBe(30_000_000);
    expect(llmMonthlyBudgetMicroUsd('abc')).toBe(30_000_000);
    process.env.OPENAI_MONTHLY_BUDGET_USD = '7';
    expect(llmMonthlyBudgetMicroUsd()).toBe(7_000_000);
  });

  it('önce ayır, sonra kesinleştir: tahmin eklenir, gerçek maliyet farkı yazılır; bilinmiyorsa tahmin kalır', async () => {
    const r = await reserveLlmBudget(2_000, { month: M, capMicroUsd: CAP });
    expect(r).toEqual({ month: M, estimate: 2_000, store: 'redis' });
    expect(h.store.get(KEY)).toBe(2_000);
    await settleLlmBudget(r, 700);
    expect(h.store.get(KEY)).toBe(700);
    const r2 = await reserveLlmBudget(2_000, { month: M, capMicroUsd: CAP });
    await settleLlmBudget(r2, null); // zaman aşımı: üst sınır kalır
    expect(h.store.get(KEY)).toBe(2_700);
    expect(await readLlmBudget(M)).toMatchObject({ month: M, usedMicroUsd: 2_700 });
  });

  it('tavan: aşan rezervasyon geri alınır ve null döner; eşzamanlı istekler aşamaz', async () => {
    h.store.set(KEY, CAP - 2_000 * 3);
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveLlmBudget(2_000, { month: M, capMicroUsd: CAP })));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(h.store.get(KEY)).toBe(CAP);
    expect(await reserveLlmBudget(1, { month: M, capMicroUsd: CAP })).toBeNull();
    expect(h.store.get(KEY)).toBe(CAP);
  });

  it('Sentry: %80\'de warning, %100\'de error; ay başına birer kez', async () => {
    h.store.set(KEY, CAP * 0.8 - 1_000);
    await reserveLlmBudget(500, { month: M, capMicroUsd: CAP });
    expect(h.messages).toEqual([]);
    await reserveLlmBudget(500, { month: M, capMicroUsd: CAP });
    await reserveLlmBudget(500, { month: M, capMicroUsd: CAP });
    expect(h.messages).toEqual([{ msg: `OpenAI aylık bütçe %80: 8.00 / 10.00 USD (${M})`, level: 'warning' }]);
    h.store.set(KEY, CAP);
    expect(await reserveLlmBudget(500, { month: M, capMicroUsd: CAP })).toBeNull();
    expect(await reserveLlmBudget(500, { month: M, capMicroUsd: CAP })).toBeNull();
    expect(h.messages[1]).toEqual({ msg: `OpenAI aylık bütçe %100: 10.00 / 10.00 USD (${M})`, level: 'error' });
    expect(h.messages).toHaveLength(2);
  });

  it('Redis kesintisi: instance içi yedek sayaç, tavanın dörtte biri (sınırsız kalmaz, ödeyen kapanmaz)', async () => {
    h.down = true;
    const share = Math.round(CAP * LLM_BUDGET_OUTAGE_SHARE);
    const r = await reserveLlmBudget(share - 1, { month: M, capMicroUsd: CAP });
    expect(r).toMatchObject({ store: 'memory' });
    expect(await reserveLlmBudget(2, { month: M, capMicroUsd: CAP })).toBeNull();
    await settleLlmBudget(r, 100);
    expect(await reserveLlmBudget(2, { month: M, capMicroUsd: CAP })).toMatchObject({ store: 'memory' });
    expect(h.store.size).toBe(0);
  });

  it('Redis tanımlı değilse (yerel) instance içi tam tavan', async () => {
    h.configured = false;
    expect(await reserveLlmBudget(CAP, { month: M, capMicroUsd: CAP })).toMatchObject({ store: 'memory' });
    expect(await reserveLlmBudget(1, { month: M, capMicroUsd: CAP })).toBeNull();
    expect(await readLlmBudget(M)).toMatchObject({ usedMicroUsd: CAP });
  });

  it('maliyet tablosu: gpt-6-luna fiyatı; bilinmeyen model muhafazakâr; önbellekli girdi ucuz', () => {
    expect(llmPrice('gpt-6-luna')).toEqual({ input: 0.1, cached: 0.01, output: 0.5 });
    expect(llmPrice('gpt-6-luna-2026-09-01')).toEqual(llmPrice('gpt-6-luna'));
    expect(llmPrice('bilinmeyen')).toEqual({ input: 2, cached: 0.5, output: 10 });
    expect(llmCostMicroUsd('gpt-6-luna', { input: 1_000_000, cached: 0, output: 0 })).toBe(100_000);
    expect(llmCostMicroUsd('gpt-6-luna', { input: 1_000_000, cached: 1_000_000, output: 0 })).toBe(10_000);
    expect(llmCostMicroUsd('gpt-6-luna', { input: 5000, cached: 2400, output: 60 })).toBe(Math.ceil(2600 * 0.1 + 2400 * 0.01 + 60 * 0.5));
  });
});
