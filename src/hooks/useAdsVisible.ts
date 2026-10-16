import { useSession } from 'next-auth/react';
import { ADS_ENABLED } from '@/config/ads';

/**
 * Reklam/sponsor alanları gösterilsin mi: bayrak açık VE oturum durumu netleşmiş. Premium kaldırıldı (2026-10-16):
 * reklamsız kullanıcı yok (yönetici de görür). Oturum yüklenirken `false` (ilk boyamada yer kayması olmasın).
 */
export function useAdsVisible(): boolean {
  const { status } = useSession();
  return ADS_ENABLED && status !== 'loading';
}
