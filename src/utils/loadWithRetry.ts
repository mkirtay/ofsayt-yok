/** Hata ≠ veri yok: `{ data }` başarılı (boş da olabilir), `{ error: true }` denemeler tükendi. */
export type LoadResult<T> = { data: T } | { error: true };

export const LOAD_RETRY_DELAY_MS = 1500;

/**
 * `fetcher`'ı çağırır; hata (zaman aşımı / 429 / 5xx / ağ) "veri yok" sayılmaz: `retries` kez `delayMs` sonra yeniden
 * denenir, yine olmazsa `{ error: true }`. `isCancelled` true olursa yeni deneme yapılmaz.
 */
export function loadWithRetry<T>(
  fetcher: () => Promise<T>,
  opts: { retries?: number; delayMs?: number; isCancelled?: () => boolean } = {},
): Promise<LoadResult<T>> {
  const { retries = 1, delayMs = LOAD_RETRY_DELAY_MS, isCancelled = () => false } = opts;
  return fetcher().then(
    (data) => ({ data }),
    () =>
      retries > 0 && !isCancelled()
        ? new Promise<void>((r) => setTimeout(r, delayMs)).then(() =>
            isCancelled() ? { error: true as const } : loadWithRetry(fetcher, { retries: retries - 1, delayMs, isCancelled }),
          )
        : { error: true as const },
  );
}
