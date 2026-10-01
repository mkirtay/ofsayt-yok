import { liveScoreApi, type LiveScoreHttpClient } from './api';
import {
  runWithRequestStats,
  type RequestStatsStore,
} from '@/server/livescoreRequestStats';

type Als = {
  getStore: () => LiveScoreHttpClient | undefined;
  run: <T>(store: LiveScoreHttpClient, fn: () => T | Promise<T>) => T | Promise<T>;
};

let alsSingleton: Als | null = null;

function getAls(): Als | null {
  if (typeof window !== 'undefined') return null;
  if (alsSingleton == null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    alsSingleton = new AsyncLocalStorage<LiveScoreHttpClient>() as unknown as Als;
  }
  return alsSingleton;
}

export function getLiveScoreHttpClient(): LiveScoreHttpClient {
  const als = getAls();
  const fromStore = als?.getStore();
  return fromStore ?? liveScoreApi;
}

/**
 * SSR / sunucu tarafında istek başına LiveScore client (axios örneği) kullanır.
 * AsyncLocalStorage ile eşzamanlı isteklerde client override çakışmaz.
 * İsteğe bağlı `stats` ile upstream/cache hit sayıları izlenir.
 */
export function runWithLiveScoreHttpClient<T>(
  client: LiveScoreHttpClient,
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
