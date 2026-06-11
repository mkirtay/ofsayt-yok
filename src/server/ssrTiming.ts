import { getRequestStats } from '@/server/livescoreRequestStats';

const LOG_ENABLED =
  process.env.SSR_TIMING === '1' ||
  (process.env.NODE_ENV !== 'production' && process.env.SSR_TIMING !== '0');

/**
 * SSR loader süresini ve LiveScore istek istatistiklerini loglar.
 * `SSR_TIMING=1` ile prod'da da açılabilir.
 */
export async function timedSsrLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    if (LOG_ENABLED) {
      const ms = Math.round(performance.now() - start);
      const stats = getRequestStats();
      const upstream = stats?.upstream ?? '?';
      const hits = stats?.cacheHits ?? '?';
      console.log(`[SSR ${label}] ${ms}ms | upstream=${upstream} cacheHits=${hits}`);
    }
  }
}
