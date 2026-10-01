import { useEffect, useState } from 'react';

/**
 * Saate bağlı metinler (geri sayım, "Bugün/Yarın") için şimdiki zaman. SSR'da ve ilk istemci çiziminde null →
 * sunucu/CDN HTML'inde sabit tarih kalır, hydration uyuşmazlığı olmaz; mount sonrası `intervalMs`'te bir güncellenir.
 * `enabled` false iken zamanlayıcı kurulmaz.
 */
export function useNow(intervalMs = 30_000, enabled = true): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [intervalMs, enabled]);
  return enabled ? now : null;
}
