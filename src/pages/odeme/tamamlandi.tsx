import { useEffect, useRef, useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import PaymentReturnPrivacy from '@/components/PaymentReturnPrivacy';
import { MERCHANT_ORDER_ID_RE, readReturnOrderId } from '@/lib/paymentReturnUrl';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import { useCredits } from '@/hooks/useCredits';
import { LAST_PAYMENT_KEY } from '@/components/PaymentBuyButton';
import type { OrderStatusView } from '@/server/payments/paymentOrders';
import styles from './odeme.module.scss';
import { brandTitle } from '@/config/brand';

const POLL_MS = 2000;
const POLL_FOR_MS = 90_000;

type View = { kind: 'loading' } | { kind: 'notfound' } | { kind: 'order'; order: OrderStatusView; slow: boolean };

/**
 * Hikie'den dönüş: durum KENDİ API'mizden okunur (kredi kararı yalnız imzalı webhook'ta verilir; bu sayfa yönlendirme
 * parametresine göre hiçbir şey vermez). PENDING ise kısa yoklama.
 * Gizlilik: Hikie adrese müşteri e-postası vb. ekler → ilk yüklemede _document betiği, sonra PaymentReturnPrivacy siler.
 * Hangi sipariş: adreste (callback yönlendirmesi) ya da bu sekmede başlatılan; yoksa sunucu kullanıcının son 30 dk'da
 * ödenen / son 24 sa açılan siparişini bulur (başka tarayıcı / cihazda ödeme). Sunucu yalnız oturum sahibinin siparişini döner.
 */
export default function PaymentDonePage() {
  const { t } = useTranslation('credits');
  const { status: sessionStatus } = useSession();
  const { refresh } = useCredits();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const refreshed = useRef(false);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    // Hangi sipariş: URL'de varsa o, yoksa bu sekmede başlatılan, o da yoksa sunucu seçer (sahipliği sunucu denetler).
    const fromUrl = readReturnOrderId(window.location.search);
    let fromStorage: string | null = null;
    try {
      fromStorage = sessionStorage.getItem(LAST_PAYMENT_KEY);
    } catch {
      fromStorage = null;
    }
    const id = [fromUrl, fromStorage].find((v): v is string => !!v && MERCHANT_ORDER_ID_RE.test(v)) ?? null;
    const started = Date.now();
    let timer = 0;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/order${id ? `?merchantOrderId=${id}` : ''}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 404) {
          setView({ kind: 'notfound' });
          return;
        }
        if (res.ok) {
          const order = (await res.json()) as OrderStatusView;
          if (cancelled) return;
          const slow = Date.now() - started > POLL_FOR_MS;
          setView({ kind: 'order', order, slow });
          if (order.status === 'PENDING' && !slow) timer = window.setTimeout(() => void poll(), POLL_MS);
          if (order.status === 'PAID' && !refreshed.current) {
            refreshed.current = true;
            void refresh(); // başlıktaki bakiye
          }
          return;
        }
      } catch {
        // ağ hatası: yeniden dene
      }
      if (!cancelled && Date.now() - started <= POLL_FOR_MS) timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  let body: React.ReactNode;
  if (sessionStatus === 'unauthenticated') {
    body = (
      <>
        <h1 className={styles.title}>{t('payment.doneTitle')}</h1>
        <p className={styles.text}>{t('payment.signIn')}</p>
        <div className={styles.actions}>
          <Link className={styles.btn} href={`/auth/signin?callbackUrl=${encodeURIComponent('/odeme/tamamlandi')}`}>
            {t('payment.signInCta')}
          </Link>
        </div>
      </>
    );
  } else if (view.kind === 'loading' || (view.kind === 'order' && view.order.status === 'PENDING' && !view.slow)) {
    body = (
      <>
        <div className={styles.spinner} aria-hidden="true" />
        <h1 className={styles.title}>{t('payment.verifying')}</h1>
        <p className={styles.text}>{t('payment.verifyingHint')}</p>
      </>
    );
  } else if (view.kind === 'notfound') {
    body = (
      <>
        <h1 className={styles.title}>{t('payment.doneTitle')}</h1>
        <p className={styles.text}>{t('payment.notFound')}</p>
        <div className={styles.actions}>
          <Link className={styles.btn} href="/credits">
            {t('payment.backToCredits')}
          </Link>
        </div>
      </>
    );
  } else {
    const { order } = view;
    if (order.status === 'PAID') {
      body = (
        <>
          <h1 className={styles.title}>{t('payment.paidTitle')}</h1>
          {order.packageCredits ? <p className={styles.text}>{t('payment.paidAdded', { added: order.packageCredits })}</p> : null}
          <p className={styles.strong}>
            {t('payment.paidCredits', { credits: order.credits })}
          </p>
          <div className={styles.actions}>
            <Link className={styles.btn} href="/">
              {t('payment.toHome')}
            </Link>
            <Link className={`${styles.btn} ${styles.btnGhost}`} href="/profile">
              {t('payment.toProfile')}
            </Link>
          </div>
        </>
      );
    } else if (order.status === 'PENDING') {
      body = (
        <>
          <h1 className={styles.title}>{t('payment.doneTitle')}</h1>
          <p className={styles.text}>{t('payment.slow')}</p>
          <div className={styles.actions}>
            <Link className={styles.btn} href="/profile">
              {t('payment.toProfile')}
            </Link>
          </div>
        </>
      );
    } else {
      body = (
        <>
          <h1 className={styles.title}>{t('payment.failedTitle')}</h1>
          <p className={styles.text}>{order.status === 'REFUNDED' ? t('payment.refunded') : t('payment.failedDesc')}</p>
          <div className={styles.actions}>
            <Link className={styles.btn} href="/credits">
              {t('payment.retry')}
            </Link>
          </div>
        </>
      );
    }
  }

  return (
    <>
      <Head>
        <title>{brandTitle(t('payment.doneTitle'))}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <PaymentReturnPrivacy keepOrderId />
      <div className={styles.wrapper}>
        <div className={styles.card} aria-live="polite">
          {body}
        </div>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'credits'])) },
});
