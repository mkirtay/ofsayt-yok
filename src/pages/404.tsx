import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import Container from '@/components/Container';
import ScaledScene from '@/components/PitchScenes/ScaledScene';
import VarScene from '@/components/PitchScenes/VarScene';
import styles from './error.module.scss';
import { brandTitle } from '@/config/brand';

export default function NotFound() {
  const { t } = useTranslation('common');

  return (
    <>
      <Head>
        <title>{brandTitle(t('notFoundTitle'))}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container>
        <div className={styles.wrapper}>
          <div className={styles.scene} aria-hidden="true">
            <ScaledScene>
              <VarScene />
            </ScaledScene>
          </div>
          <div className={styles.eyebrow}>404</div>
          <h1 className={styles.title}>{t('notFoundOffside')}</h1>
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
