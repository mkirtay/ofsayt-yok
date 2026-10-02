const LOG_ENABLED =
  process.env.SSR_TIMING === '1' ||
  (process.env.NODE_ENV !== 'production' && process.env.SSR_TIMING !== '0');

/**
 * SSR loader süresini loglar (Sportmonks istek/cache sayıları `server/sportmonks/cachedFetch.ts` tarafında).
 * `SSR_TIMING=1` ile prod'da da açılabilir.
 */
export async function timedSsrLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    if (LOG_ENABLED) {
      console.log(`[SSR ${label}] ${Math.round(performance.now() - start)}ms`);
    }
  }
}
