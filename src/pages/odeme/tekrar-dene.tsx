import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PaymentReturnPrivacy from '@/components/PaymentReturnPrivacy';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import styles from './odeme.module.scss';
import { brandTitle } from '@/config/brand';

/** Hikie'de ödeme tamamlanmadı / iptal: bilgi + kredi sayfasına dönüş. Hiçbir durum değiştirmez; Hikie sorgusu adresten silinir. */
export default function PaymentRetryPage() {
  const { t } = useTranslation('credits');
  return (
    <>
      <Head>
        <title>{brandTitle(t('payment.retryTitle'))}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <PaymentReturnPrivacy keepOrderId={false} />
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('payment.retryTitle')}</h1>
          <p className={styles.text}>{t('payment.retryDesc')}</p>
          <div className={styles.actions}>
            <Link className={styles.btn} href="/pricing">
              {t('payment.retry')}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'credits'])) },
});
