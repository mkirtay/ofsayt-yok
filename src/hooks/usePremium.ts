import { useSession } from 'next-auth/react';

export type PremiumState = {
  /** `loading` durumunda true */
  loading: boolean;
  /** Kullanıcı oturum açık mı */
  authenticated: boolean;
  /** Premium üye mi (ADMIN dahil) */
  isPremium: boolean;
  /** Premium bitiş tarihi (ISO) */
  premiumUntil: string | null;
};

/**
 * Premium üyelik durumunu okuma. JWT'de hesaplandığı için ek istek atmaz.
 */
export function usePremium(): PremiumState {
  const { data: session, status } = useSession();
  return {
    loading: status === 'loading',
    authenticated: status === 'authenticated',
    isPremium: Boolean(session?.user?.isPremium),
    premiumUntil: session?.user?.premiumUntil ?? null,
  };
}
