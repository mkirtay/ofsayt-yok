import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import Container from '@/components/Container';
import styles from './error.module.scss';

export default function NotFound() {
  const { t } = useTranslation('common');

  return (
    <>
      <Head>
        <title>{t('notFoundTitle')} | Ofsayt Yok</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container>
        <div className={styles.wrapper}>
          <div className={styles.code}>404</div>
          <h1 className={styles.title}>{t('notFoundTitle')}</h1>
          <p className={styles.desc}>{t('notFoundDesc')}</p>
          <Link href="/" className={styles.btn}>
            {t('backToHome')}
          </Link>
        </div>
      </Container>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common'])),
  },
});
