/**
 * Sekme görünürken `intervalMs`'de bir `fn`; gizliyken hiç çağırmaz. Sekme öne gelince son çağrı `intervalMs`'den
 * eskiyse hemen bir kez çağırır (veri bayat kalmasın), sonra düzenli devam eder. Dönüş: durdurucu.
 */
export type VisibilityDoc = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

export function startVisiblePolling(
  fn: () => void,
  intervalMs: number,
  doc: VisibilityDoc = document,
  now: () => number = Date.now,
): () => void {
  let lastRun = now();
  const run = () => {
    lastRun = now();
    fn();
  };
  const timer = setInterval(() => {
    if (!doc.hidden) run();
  }, intervalMs);
  const onVisibility = () => {
    if (!doc.hidden && now() - lastRun >= intervalMs) run();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    clearInterval(timer);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
