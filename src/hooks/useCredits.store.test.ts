import { describe, expect, it, vi } from 'vitest';
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
import { creditsStoreForTests as store, resolveCredits } from './useCredits';

describe('kredi bakiyesi — ortak depo', () => {
  it('taze bakiye bütün aboneleri (header + analiz sekmesi) aynı anda günceller', () => {
    const header = vi.fn();
    const tab = vi.fn();
    const offA = store.subscribe(header);
    const offB = store.subscribe(tab);
    store.set({ value: 90, baseline: 95 });
    expect(header).toHaveBeenCalledTimes(1);
    expect(tab).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ value: 90, baseline: 95 });
    offA();
    offB();
    store.set(null);
  });

  it('JWT bakiyesi değişince (senkron) override devre dışı kalır', () => {
    expect(resolveCredits({ value: 90, baseline: 95 }, 95)).toBe(90);
    expect(resolveCredits({ value: 90, baseline: 95 }, 90)).toBe(90);
    expect(resolveCredits({ value: 90, baseline: 95 }, 100)).toBe(100);
    expect(resolveCredits(null, undefined)).toBe(0);
  });
});
