import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import { useCredits } from '@/hooks/useCredits';
import { lockBodyScroll } from '@/utils/scrollLock';
import { WEEKLY_GIFT_AMOUNT } from '@/lib/weeklyGift';
import styles from './weeklyGift.module.scss';

type Phase = 'offer' | 'busy' | 'done';

/**
 * Haftalık hediye pop-up'ı (görünüm): ConfirmDialog ile aynı kalıp — masaüstünde ortada, mobilde alttan sheet; odak
 * tuzağı, Esc / dış tık / Sonra kapatır, kapanınca odak geri döner, scroll kilidi `lockBodyScroll`.
 */
export function WeeklyGiftDialogView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('credits');
  const { apply } = useCredits();
  const [phase, setPhase] = useState<Phase>('offer');
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  busyRef.current = phase === 'busy';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    primaryRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!busyRef.current) onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)');
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      unlock();
      previous?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    if (phase === 'done') primaryRef.current?.focus();
  }, [phase]);

  async function claim() {
    setPhase('busy');
    setError(null);
    try {
      const res = await fetch('/api/rewards/weekly-gift', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { credits?: number; code?: string };
      if (res.ok && typeof body.credits === 'number') {
        apply(body.credits);
        setBalance(body.credits);
        setPhase('done');
        return;
      }
      // Zaten alınmış (başka sekme) → pop-up'ı sessizce kapat.
      if (res.status === 409) return onClose();
      setError(t('weeklyGift.error'));
    } catch {
      setError(t('weeklyGift.error'));
    }
    setPhase('offer');
  }

  const amount = WEEKLY_GIFT_AMOUNT;
  const done = phase === 'done';

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busyRef.current && onClose()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <button type="button" className={styles.close} onClick={onClose} disabled={phase === 'busy'} aria-label={t('weeklyGift.close')}>
          <span aria-hidden="true">×</span>
        </button>
        <div className={styles.hero} aria-hidden="true">
          <span className={styles.gift}>{done ? '✓' : '🎁'}</span>
          <span className={styles.amount}>+{amount} ⚡</span>
        </div>
        <div className={styles.body}>
          <h2 id={titleId} className={styles.title}>
            {done ? t('weeklyGift.doneTitle', { amount }) : t('weeklyGift.title')}
          </h2>
          <p id={descId} className={styles.message}>
            {done ? t('weeklyGift.doneMessage', { credits: balance ?? '' }) : t('weeklyGift.message', { amount })}
          </p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={styles.foot}>
          {done ? (
            <button ref={primaryRef} type="button" className={styles.primary} onClick={onClose}>
              {t('weeklyGift.ok')}
            </button>
          ) : (
            <>
              <button ref={primaryRef} type="button" className={styles.primary} onClick={() => void claim()} disabled={phase === 'busy'}>
                {phase === 'busy' ? t('weeklyGift.claiming') : t('weeklyGift.claim', { amount })}
              </button>
              <button type="button" className={styles.secondary} onClick={onClose} disabled={phase === 'busy'}>
                {t('weeklyGift.later')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Portal: `[data-app-root]` (Inter fontu orada tanımlı). */
export default function WeeklyGiftDialog({ onClose }: { onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<WeeklyGiftDialogView onClose={onClose} />, document.querySelector('[data-app-root]') ?? document.body);
}
