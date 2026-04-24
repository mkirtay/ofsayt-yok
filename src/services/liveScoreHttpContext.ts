import { liveScoreApi } from './api';
import type { AxiosInstance } from 'axios';

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
 * SSR / sunucu tarafında istek başına `/api/livescore` tabanlı axios kullanır.
 * AsyncLocalStorage ile eşzamanlı isteklerde client override çakışmaz.
 */
export function runWithLiveScoreHttpClient<T>(
  client: AxiosInstance,
  fn: () => Promise<T>
): Promise<T> {
  const als = getAls();
  if (!als) return fn();
  return als.run(client, fn) as Promise<T>;
}
