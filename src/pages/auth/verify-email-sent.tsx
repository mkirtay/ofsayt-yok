import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from './auth.module.scss';

export default function VerifyEmailSentPage() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const email = typeof router.query.email === 'string' ? router.query.email : '';

  return (
    <>
      <Head>
        <title>{t('verifyEmail.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('verifyEmail.title')}</h1>
          <p className={styles.footer}>
            {t('verifyEmail.sentMessage', { email: email || t('verifyEmail.fallbackEmail') })}
          </p>
          <p className={styles.footer} style={{ marginTop: 8 }}>
            {t('verifyEmail.notReceived')}
          </p>
          <p className={styles.footer} style={{ marginTop: 16 }}>
            <Link href="/auth/signin" className={styles.link}>
              {t('verifyEmail.signInLink')}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'auth'])),
  },
});
