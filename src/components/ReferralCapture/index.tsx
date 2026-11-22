import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { clearReferralCookie, readReferralCookie } from '@/lib/referralClient';

/**
 * Davet linkiyle gelip Google ile üye olanlar (büyüme raporu 2.3): giriş yapılınca çerezdeki kod bir kez sunucuya
 * gönderilir; sunucu yalnız 48 saatlik yeni hesabı ve henüz davete bağlı olmayanı bağlar. Sonuç ne olursa çerez silinir.
 */
export default function ReferralCapture() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'authenticated') return;
    const code = readReferralCookie();
    if (!code) return;
    clearReferralCookie();
    void fetch('/api/user/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => {});
  }, [status]);
  return null;
}
