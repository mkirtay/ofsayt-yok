import { useCallback, useEffect, useState } from 'react';
import type { Leaderboard, MyStanding } from '@/server/frikik/leaderboardService';

export type { Leaderboard, MyStanding };

/**
 * Frikik skor tablosu (herkese açık, CDN/Redis önbellekli) + oturumdaki kullanıcının durumu. react-query'siz (sayfa
 * ve ana sayfa kartı sağlayıcısız da çalışsın; SSR'da hiç istek yok). `enabled` false iken istek atılmaz (kart ekranın
 * dışındayken). `me` yalnız `signedIn` iken.
 */
export function useFrikikBoard(enabled: boolean, signedIn: boolean) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [me, setMe] = useState<MyStanding | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/frikik/leaderboard')
      .then((r) => (r.ok ? (r.json() as Promise<Leaderboard>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!cancelled) setBoard(b);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  useEffect(() => {
    if (!enabled || !signedIn) return;
    let cancelled = false;
    fetch('/api/frikik/me', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<MyStanding>) : null))
      .then((m) => {
        if (!cancelled) setMe(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, signedIn, tick]);

  // Oturum kapanınca kişisel durum gösterilmez (yeniden girişte tazelenir).
  return { board, me: signedIn ? me : null, error, refresh, setMe };
}
