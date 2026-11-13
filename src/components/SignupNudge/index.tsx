import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useBottomStackSlot } from '@/hooks/useBottomStackSlot';
import { isNudgeCoolingDown, isNudgeHiddenPath, NUDGE_DELAY_MS, NUDGE_STORAGE_KEY } from './nudge';
import { useNudgeStack } from './useNudgeStack';
import { INTRO_DONE_EVENT, isIntroPending } from '@/components/Onboarding/storage';
import styles from './signupNudge.module.scss';

/**
 * Misafir ziyaretçiye "üye ol, 2 kredi hediye" daveti. İlk boyamada yok (zamanlayıcıyla gelir, `position: fixed` → CLS/LCP'ye
 * dokunmaz); kapatılınca 1 gün çıkmaz. Girişliyse ya da oturum durumu belli değilken hiç çizilmez.
 */
export default function SignupNudge() {
  const { t } = useTranslation('nav');
  const { pathname } = useRouter();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const eligible = status === 'unauthenticated' && !isNudgeHiddenPath(pathname);
  // İlk ziyarette önce tanıtım (karşılama kartı + ipuçları): kart kapatılınca ya da sonraki ziyarette sayaç başlar.
  const [introTick, setIntroTick] = useState(0);
  const ref = useRef<HTMLElement>(null);
  // Mobil alt yığının tabanı: yüksekliği paylaşılır, gol bildirimleri vb. kartın üstüne dizilir (hooks/useBottomStackSlot).
  useBottomStackSlot(ref, open && eligible);

  useEffect(() => {
    if (!eligible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- oturum açılınca / gizli sayfaya geçince kart kapanır (dış durum)
      setOpen(false);
      return;
    }
    try {
      if (isNudgeCoolingDown(localStorage.getItem(NUDGE_STORAGE_KEY), Date.now())) return;
    } catch {
      /* depolama kapalı: yine de göster */
    }
    if (isIntroPending()) {
      const onIntroDone = () => setIntroTick((n) => n + 1);
      window.addEventListener(INTRO_DONE_EVENT, onIntroDone, { once: true });
      return () => window.removeEventListener(INTRO_DONE_EVENT, onIntroDone);
    }
    const id = window.setTimeout(() => setOpen(true), NUDGE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [eligible, introTick]);

  // Açıkken alt yığına bildir: `<html data-signup-nudge>` + mobilde `--nudge-top-offset` (kartın tepesi + boşluk).
  const visible = open && eligible;
  useNudgeStack(ref, visible);

  if (!open || !eligible) return null;

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(NUDGE_STORAGE_KEY, String(Date.now()));
    } catch {
      /* yoksay */
    }
  };

  return (
    <aside ref={ref} className={styles.nudge} role="complementary" aria-label={t('nudge.title')}>
      <span className={styles.icon} aria-hidden="true">
        🎁
      </span>
      <div className={styles.body}>
        <strong>{t('nudge.title')}</strong>
        <span className={styles.badge}>{t('nudge.badge')}</span>
        <span>{t('nudge.text')}</span>
        <Link href="/auth/signup?src=nudge" className={styles.cta} onClick={close}>
          {t('nudge.cta')}
        </Link>
      </div>
      <button type="button" className={styles.close} onClick={close} aria-label={t('nudge.close')}>
        ×
      </button>
    </aside>
  );
}
