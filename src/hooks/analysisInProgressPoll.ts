/**
 * Analiz başka bir istekte (başka kullanıcı ya da maç öncesi cron) üretilirken POST 409 `ANALYSIS_IN_PROGRESS`
 * döner. İstemci hata göstermez; kayıt hazır olana kadar saklı analizi (GET `?optional=1`) aralıklarla yoklar.
 */
export const IN_PROGRESS_POLL_MS = 4_000;
/** ~2 dk: üretim 35 sn zaman aşımı + bağlam kurma ile sınırlı; aşılırsa kullanıcıya "birazdan tekrar dene". */
export const IN_PROGRESS_MAX_TRIES = 30;

export type PollOutcome<T> = { status: 'ready'; value: T } | { status: 'timeout' } | { status: 'cancelled' };

export async function pollUntilReady<T>(
  load: () => Promise<T | null>,
  opts: { intervalMs?: number; maxTries?: number; sleep?: (ms: number) => Promise<void>; isCancelled?: () => boolean } = {},
): Promise<PollOutcome<T>> {
  const interval = opts.intervalMs ?? IN_PROGRESS_POLL_MS;
  const max = opts.maxTries ?? IN_PROGRESS_MAX_TRIES;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < max; i++) {
    await sleep(interval);
    if (opts.isCancelled?.()) return { status: 'cancelled' };
    try {
      const value = await load();
      if (opts.isCancelled?.()) return { status: 'cancelled' };
      if (value != null) return { status: 'ready', value };
    } catch {
      // geçici ağ hatası: yoklamaya devam
    }
  }
  return { status: 'timeout' };
}
