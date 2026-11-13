import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { isIntroPending } from '@/components/Onboarding/storage';
import { REWARD_NUDGE_DELAY_MS, REWARD_NUDGE_STORAGE_KEY, isRewardNudgeHiddenPath, shownToday } from './pick';

/** Kart yalnız gösterilecekse yüklenir: ilk paket büyümez, ilk boyamada yok (CLS/LCP'ye dokunmaz). */
const RewardNudgeCard = dynamic(() => import('./Card'), { ssr: false });

/**
 * Girişli kullanıcıya günde bir kez "ücretsiz kredi kazan" kartı (misafir karşılığı: SignupNudge). Bulunulan sayfaya göre
 * içerik: Frikik'te bu ayın gün ilerlemesi, tahmin oyununda haftanın ilerlemesi, başka sayfalarda görev / oyun ödülleri.
 */
export default function RewardNudge() {
  const { pathname } = useRouter();
  const { status } = useSession();
  const [ready, setReady] = useState(false);
  const eligible = status === 'authenticated' && !isRewardNudgeHiddenPath(pathname);

  useEffect(() => {
    if (!eligible || ready) return;
    try {
      if (shownToday(localStorage.getItem(REWARD_NUDGE_STORAGE_KEY), Date.now())) return;
    } catch {
      return; // depolama kapalı: her sayfada tekrar çıkmasın diye hiç gösterme
    }
    if (isIntroPending()) return;
    const id = window.setTimeout(() => setReady(true), REWARD_NUDGE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [eligible, ready]);

  return ready && eligible ? <RewardNudgeCard onDone={() => setReady(false)} /> : null;
}
