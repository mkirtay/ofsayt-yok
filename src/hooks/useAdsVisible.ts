import { useSession } from 'next-auth/react';
import { ADS_ENABLED } from '@/config/ads';
import { isPremiumUser } from '@/lib/premium';

/**
 * Reklam/sponsor alanları gösterilsin mi: bayrak açık VE oturum durumu netleşmiş VE kullanıcı premium değil.
 * Oturum yüklenirken `false` döner (premium kullanıcıya reklamın bir an görünüp kaybolmaması için).
 */
export function useAdsVisible(): boolean {
  const { data: session, status } = useSession();
  if (!ADS_ENABLED || status === 'loading') return false;
  return !isPremiumUser({ role: session?.user?.role, credits: session?.user?.credits });
}
