/**
 * Yanıt döndükten sonra da sürmesi gereken iş (stale-while-revalidate yenilemesi). Vercel'de istek bağlamının
 * `waitUntil`'i (`@vercel/functions`'ın okuduğu aynı bağlam) — fonksiyon iş bitene kadar açık kalır; bağlam yoksa
 * (yerel `next start` / dev) iş yine başlar, süreç zaten açık.
 */
type RequestContext = { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined };

export function runInBackground(task: () => Promise<unknown>): void {
  const promise = task().catch((error: unknown) => console.error('[background] görev hatası', error));
  const ctx = (globalThis as Record<symbol, RequestContext | undefined>)[Symbol.for('@vercel/request-context')];
  ctx?.get?.()?.waitUntil?.(promise);
}
