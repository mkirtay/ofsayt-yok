/**
 * Sentry'yi ilk hatada yükler: ilk açılışta SDK indirilmez (~45 KB gzip tasarruf). İlk `error` /
 * `unhandledrejection` olayında `@sentry/nextjs` dinamik yüklenir, başlatılır ve o ana kadar biriken
 * hatalar gönderilir — ilk hata kaybolmaz. SDK başlayınca kendi global yakalayıcıları devreye girer,
 * bizimkiler kaldırılır (çift kayıt olmasın). Yükleme başarısız olursa bir sonraki hatada yeniden denenir.
 */
type SentryLike = {
  init: (options: never) => unknown;
  captureException: (error: unknown) => unknown;
};

export type LazySentryOptions = {
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  enabled: boolean;
  options: { dsn?: string } & Record<string, unknown>;
  load: () => Promise<SentryLike>;
};

/** Tampon sınırı: yükleme uzun sürerse hata seli belleği şişirmesin. */
const MAX_QUEUE = 20;

export function installLazySentry({ target, enabled, options, load }: LazySentryOptions): { loaded: () => Promise<void> | null } {
  let pending: Promise<void> | null = null;
  if (!enabled || !options.dsn) return { loaded: () => pending };

  const queue: unknown[] = [];

  const flushTo = (sentry: SentryLike) => {
    sentry.init(options as never);
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection as EventListener);
    for (const err of queue.splice(0)) sentry.captureException(err);
  };

  const ensureLoaded = () => {
    if (pending) return;
    pending = load()
      .then(flushTo)
      .catch(() => {
        pending = null; // ağ hatası: sıradaki hatada tekrar dene, tampon korunur
      });
  };

  function onError(e: Event) {
    const ev = e as ErrorEvent;
    if (queue.length < MAX_QUEUE) queue.push(ev.error ?? new Error(ev.message || 'Bilinmeyen hata'));
    ensureLoaded();
  }

  function onRejection(e: PromiseRejectionEvent) {
    if (queue.length < MAX_QUEUE) queue.push(e.reason ?? new Error('Yakalanmamış promise reddi'));
    ensureLoaded();
  }

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection as EventListener);
  return { loaded: () => pending };
}
