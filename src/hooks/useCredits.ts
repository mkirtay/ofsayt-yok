import { useCallback, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';

export type CreditsState = {
  /** `loading` durumunda true */
  loading: boolean;
  /** Kullanıcı oturum açık mı */
  authenticated: boolean;
  /** Güncel kredi bakiyesi (JWT throttle nedeniyle bir miktar bayat olabilir) */
  credits: number;
  /** JWT'yi beklemeden bakiyeyi DB'den taze çeker (ör. bir harcamadan hemen sonra) */
  refresh: () => Promise<void>;
  /** Sunucu yanıtındaki güncel bakiyeyi ek istek atmadan uygular (ör. analiz POST'u `credits` döndüğünde). */
  apply: (value: number) => void;
};

type Override = { value: number; baseline: number | undefined };

/**
 * Taze bakiye bütün `useCredits` kullanıcılarında ORTAK (modül deposu): analiz sekmesi bakiyeyi tazelediğinde
 * header'daki rozet de aynı anda güncellenir. Eskiden her hook kopyası kendi state'ini tutuyordu → header JWT
 * senkronuna (≤60 sn) kadar eski bakiyeyi gösteriyordu.
 */
let shared: Override | null = null;
const listeners = new Set<() => void>();

function setShared(next: Override | null) {
  shared = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => shared;
const getServerSnapshot = (): Override | null => null;

/** Testler için: ortak depoya doğrudan erişim. */
export const creditsStoreForTests = { subscribe, getSnapshot, set: setShared };

/** Override, session'daki kredi `baseline`'dan farklılaşınca (JWT senkronu) devre dışı kalır. */
export function resolveCredits(override: Override | null, sessionCredits: number | undefined): number {
  return override && override.baseline === sessionCredits ? override.value : (sessionCredits ?? 0);
}

/**
 * Kredi bakiyesi okuma. JWT'de hesaplandığı için varsayılan ek istek atmaz;
 * `refresh()` / `apply()` ile anlık senkronizasyon sağlanır ve bütün bileşenlere yayılır.
 */
export function useCredits(): CreditsState {
  const { data: session, status } = useSession();
  const sessionCredits = session?.user?.credits;
  const override = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const apply = useCallback((value: number) => setShared({ value, baseline: sessionCredits }), [sessionCredits]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/me');
      if (!res.ok) return;
      const body = (await res.json()) as { credits: number };
      apply(body.credits);
    } catch {
      // sessizce yoksay — bir sonraki JWT senkronunda düzelir
    }
  }, [apply]);

  return {
    loading: status === 'loading',
    authenticated: status === 'authenticated',
    credits: resolveCredits(override, sessionCredits),
    refresh,
    apply,
  };
}
