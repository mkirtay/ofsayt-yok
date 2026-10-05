import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import styles from './odeme.module.scss';

/** Hikie'de ödeme tamamlanmadı / iptal: bilgi + kredi sayfasına dönüş. Hiçbir durum değiştirmez. */
export default function PaymentRetryPage() {
  const { t } = useTranslation('credits');
  return (
    <>
      <Head>
        <title>{`${t('payment.retryTitle')} | Ofsayt Yok`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('payment.retryTitle')}</h1>
          <p className={styles.text}>{t('payment.retryDesc')}</p>
          <div className={styles.actions}>
            <Link className={styles.btn} href="/credits">
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
