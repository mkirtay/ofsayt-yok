import { useEffect, useState } from 'react';

/** Yükleme animasyonları için: `delayMs` dolmadan false (kısa yüklemelerde animasyon hiç görünmez). */
export function useDelayedShow(delayMs = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
  return shown;
}
