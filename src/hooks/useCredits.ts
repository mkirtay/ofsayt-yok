import { useCallback, useState } from 'react';
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
};

/**
 * Kredi bakiyesi okuma. JWT'de hesaplandığı için varsayılan ek istek atmaz;
 * `refresh()` ile anlık senkronizasyon sağlanabilir. Override, session'daki
 * kredi değeri JWT senkronuyla değişene kadar geçerli kalır (session değişince
 * otomatik olarak devre dışı kalır — ayrı bir reset effect'i gerekmez).
 */
export function useCredits(): CreditsState {
  const { data: session, status } = useSession();
  const sessionCredits = session?.user?.credits;
  const [override, setOverride] = useState<{ value: number; baseline: number | undefined } | null>(
    null
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/me');
      if (!res.ok) return;
      const body = (await res.json()) as { credits: number };
      setOverride({ value: body.credits, baseline: sessionCredits });
    } catch {
      // sessizce yoksay — bir sonraki JWT senkronunda düzelir
    }
  }, [sessionCredits]);

  const credits = override && override.baseline === sessionCredits ? override.value : (sessionCredits ?? 0);

  return {
    loading: status === 'loading',
    authenticated: status === 'authenticated',
    credits,
    refresh,
  };
}
