import { liveScoreApi } from './api';
import type { AxiosInstance } from 'axios';
import {
  runWithRequestStats,
  type RequestStatsStore,
} from '@/server/livescoreRequestStats';

type Als = {
  getStore: () => AxiosInstance | undefined;
  run: <T>(store: AxiosInstance, fn: () => T | Promise<T>) => T | Promise<T>;
};

let alsSingleton: Als | null = null;

function getAls(): Als | null {
  if (typeof window !== 'undefined') return null;
  if (alsSingleton == null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    alsSingleton = new AsyncLocalStorage<AxiosInstance>() as unknown as Als;
  }
  return alsSingleton;
}

export function getLiveScoreHttpClient(): AxiosInstance {
  const als = getAls();
  const fromStore = als?.getStore();
  return fromStore ?? liveScoreApi;
}

/**
 * SSR / sunucu tarafında istek başına LiveScore axios client kullanır.
 * AsyncLocalStorage ile eşzamanlı isteklerde client override çakışmaz.
 * İsteğe bağlı `stats` ile upstream/cache hit sayıları izlenir.
 */
export function runWithLiveScoreHttpClient<T>(
  client: AxiosInstance,
  fn: () => Promise<T>,
  stats?: RequestStatsStore
): Promise<T> {
  const als = getAls();
  if (!als) return fn();
  if (stats) {
    return runWithRequestStats(stats, () => als.run(client, fn) as Promise<T>);
  }
  return als.run(client, fn) as Promise<T>;
}
