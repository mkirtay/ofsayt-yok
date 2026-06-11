/**
 * SSR / sunucu tarafı LiveScore istek istatistikleri (AsyncLocalStorage).
 * In-process client her cache hit/miss ve upstream çağrısını sayar.
 */
type Als = {
  getStore: () => RequestStatsStore | undefined;
  run: <T>(store: RequestStatsStore, fn: () => T | Promise<T>) => T | Promise<T>;
};

export type RequestStatsStore = {
  upstream: number;
  cacheHits: number;
};

let alsSingleton: Als | null = null;

function getAls(): Als | null {
  if (typeof window !== 'undefined') return null;
  if (alsSingleton == null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    alsSingleton = new AsyncLocalStorage<RequestStatsStore>() as unknown as Als;
  }
  return alsSingleton;
}

export function createRequestStatsStore(): RequestStatsStore {
  return { upstream: 0, cacheHits: 0 };
}

export function runWithRequestStats<T>(
  store: RequestStatsStore,
  fn: () => Promise<T>
): Promise<T> {
  const als = getAls();
  if (!als) return fn();
  return als.run(store, fn) as Promise<T>;
}

export function getRequestStats(): RequestStatsStore | null {
  return getAls()?.getStore() ?? null;
}

export function recordCacheHit(): void {
  const store = getAls()?.getStore();
  if (store) store.cacheHits += 1;
}

export function recordUpstreamRequest(): void {
  const store = getAls()?.getStore();
  if (store) store.upstream += 1;
}
