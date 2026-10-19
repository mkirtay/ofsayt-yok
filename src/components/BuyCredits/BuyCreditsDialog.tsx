import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import { useCredits } from '@/hooks/useCredits';
import { CREDIT_PACKAGES, formatTry, perCreditKurus } from '@/config/creditPackages';
import { DISTANCE_SALES_PATH, PRE_INFO_PATH } from '@/config/legalConsent';
import { useCheckout } from '@/components/PaymentBuyButton/useCheckout';
import { lockBodyScroll } from '@/utils/scrollLock';
import styles from './buyCredits.module.scss';

/**
 * Kredi yükleme popup'ı: paket seçilince doğrudan Hikie ödemesine gider (/pricing'e uğramadan). Satın alma onayı (Ön
 * Bilgilendirme + Mesafeli Satış + cayma beyanı) burada da zorunlu: işaretlenmeden paket seçilirse uyarı + kutuya odak.
 * Satıştaki paketler GET /api/payments/packages'tan. Esc / dış tık kapatır, arka plan kaydırması kilitli.
 */
export default function BuyCreditsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('credits');
  const router = useRouter();
  const { authenticated, credits } = useCredits();
  const titleId = useId();
  const consentId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const [accepted, setAccepted] = useState(false);
  const [nudge, setNudge] = useState(false);
  const { start, busyKey, error } = useCheckout(router.asPath);
  const packages = useQuery({
    queryKey: ['payments', 'packages'],
    queryFn: async () => {
      const res = await fetch('/api/payments/packages');
      if (!res.ok) throw new Error('packages');
      return (await res.json()) as { available: string[] };
    },
    staleTime: 5 * 60_000,
  });
  const available = new Set(packages.data?.available ?? []);
  const busy = busyKey !== null;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      unlock();
      previous?.focus?.();
    };
  }, [onClose]);

  const choose = (key: string) => {
    if (busy) return;
    if (!accepted) {
      setNudge(true);
      consentRef.current?.focus();
      return;
    }
    void start(key);
  };

  const errorText = error ? t(error === 'unavailable' ? 'buyUnavailable' : error === 'termsRequired' ? 'consent.required' : 'buyError') : null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('modal.close')} disabled={busy}>
          ×
        </button>
        <p className={styles.eyebrow}>{t('heroBadge')}</p>
        <h2 id={titleId} className={styles.title}>
          {t('modal.title')}
        </h2>
        <p className={styles.desc}>
          {authenticated ? `${t('modal.desc', { credits })} ` : null}
          {t('modal.pick')}
        </p>

        {!authenticated ? (
          <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(router.asPath)}`} className={styles.signIn}>
            {t('modal.signIn')}
          </Link>
        ) : (
          <>
            <label className={`${styles.consent} ${nudge && !accepted ? styles.consentNudge : ''}`.trim()}>
              <input
                ref={consentRef}
                id={consentId}
                type="checkbox"
                className={styles.checkbox}
                checked={accepted}
                onChange={(e) => {
                  setAccepted(e.target.checked);
                  if (e.target.checked) setNudge(false);
                }}
              />
              <span>
                {t('consent.before')}
                <Link href={PRE_INFO_PATH} target="_blank" rel="noopener" className={styles.link}>
                  {t('consent.preInfo')}
                </Link>
                {t('consent.and')}
                <Link href={DISTANCE_SALES_PATH} target="_blank" rel="noopener" className={styles.link}>
                  {t('consent.contract')}
                </Link>
                {t('consent.after')}
              </span>
            </label>
            {nudge && !accepted ? (
              <p className={styles.error} role="alert">
                {t('modal.consentFirst')}
              </p>
            ) : null}

            {packages.isLoading ? (
              <p className={styles.note}>{t('modal.loading')}</p>
            ) : available.size === 0 ? (
              <p className={styles.note}>{t('modal.closed')}</p>
            ) : (
              <div className={styles.cards}>
                {CREDIT_PACKAGES.filter((p) => available.has(p.paymentKey)).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`${styles.card} ${p.featured ? styles.cardFeatured : ''}`.trim()}
                    onClick={() => choose(p.paymentKey)}
                    disabled={busy}
                    aria-busy={busyKey === p.paymentKey}
                    aria-describedby={consentId}
                  >
                    {p.featured ? <span className={styles.popular}>{t('modal.popular')}</span> : null}
                    <span className={styles.amount}>{p.credits}</span>
                    <span className={styles.unit}>{t('creditsUnit')}</span>
                    <span className={styles.price}>{formatTry(p.priceKurus)}</span>
                    <span className={styles.per}>{t('perCredit', { price: formatTry(perCreditKurus(p)) })}</span>
                  </button>
                ))}
              </div>
            )}
            {busy ? (
              <p className={styles.note} role="status">
                {t('modal.redirecting')}
              </p>
            ) : null}
            {errorText ? (
              <p className={styles.error} role="alert">
                {errorText}
              </p>
            ) : null}
          </>
        )}

        <p className={styles.footer}>
          {t('modal.secure')} {t('vatIncluded')}{' '}
          <Link href="/pricing" className={styles.link} onClick={onClose}>
            {t('modal.details')}
          </Link>
        </p>
      </div>
    </div>,
    // Uygulama köküne: `--font-sans` (next/font) değişkeni orada tanımlı; body'de Inter yerine sistem yazı tipi çıkar.
    document.querySelector('[data-app-root]') ?? document.body,
  );
}
