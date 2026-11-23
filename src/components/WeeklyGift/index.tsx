import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { isIntroPending, isWelcomeShowing } from '@/components/Onboarding/storage';
import { isNudgeOpen } from '@/components/SignupNudge/nudge';
import { WEEKLY_GIFT_STORAGE_KEY, isWeeklyGiftHiddenPath, seenThisWeek } from '@/lib/weeklyGift';
import { weekKeyOf } from '@/lib/game/week';

/** Diyalog yalnız gösterilecekse yüklenir (ilk paket ve ilk boyama etkilenmez). */
const WeeklyGiftDialog = dynamic(() => import('./Dialog'), { ssr: false });

/** Sayfa açıldıktan bu kadar sonra (ilk etkileşimi bölmesin). */
const DELAY_MS = 3000;

function markSeen() {
  try {
    localStorage.setItem(WEEKLY_GIFT_STORAGE_KEY, weekKeyOf(Date.now()));
  } catch {
    /* depolama kapalı */
  }
}

/**
 * Haftalık 2 kredi hediyesi pop-up'ı — girişli kullanıcıya TR haftası başına en çok bir kez. Önce sunucuya sorulur
 * (alınabilir mi: alınmamış + e-posta doğrulanmış); alınamıyorsa hiç çıkmaz. Kapatılınca / alınınca o hafta yeniden
 * çıkmaz (localStorage). Karşılama turu, üye ol kartı açıkken beklenir.
 */
export default function WeeklyGift() {
  const { pathname } = useRouter();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const eligible = status === 'authenticated' && !isWeeklyGiftHiddenPath(pathname);

  useEffect(() => {
    if (!eligible || open) return;
    try {
      if (seenThisWeek(localStorage.getItem(WEEKLY_GIFT_STORAGE_KEY))) return;
    } catch {
      return; // depolama kapalı: her sayfada tekrar sorulmasın
    }
    if (isIntroPending()) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      if (isWelcomeShowing() || isNudgeOpen()) return;
      try {
        const res = await fetch('/api/rewards/weekly-gift');
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { available?: boolean; claimed?: boolean };
        if (cancelled) return;
        if (body.available) setOpen(true);
        else if (body.claimed) markSeen();
      } catch {
        /* sessiz: bir sonraki sayfada yeniden denenir */
      }
    }, DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [eligible, open]);

  if (!open || !eligible) return null;
  return (
    <WeeklyGiftDialog
      onClose={() => {
        markSeen();
        setOpen(false);
      }}
    />
  );
}
