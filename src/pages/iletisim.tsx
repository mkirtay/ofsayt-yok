import Head from 'next/head';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import Container from '@/components/Container';
import trLegal from '../../public/locales/tr/legal.json';
import enLegal from '../../public/locales/en/legal.json';
import styles from './iletisim.module.scss';

export default function IletisimPage() {
  const { locale } = useI18n();
  const data = (locale === 'en' ? enLegal : trLegal).contact;
  const canonicalBase = process.env.AUTH_URL ?? 'https://ofsaytyok.app';

  return (
    <>
      <Head>
        <title>{data.pageTitle} — Ofsayt Yok</title>
        <meta name="description" content={data.pageDesc} />
        <link rel="canonical" href={`${canonicalBase}/iletisim`} />
      </Head>
      <Container>
        <div className={styles.page}>
          <Link href="/" className={styles.backLink}>
            {locale === 'en' ? '← Back to home' : '← Anasayfaya dön'}
          </Link>
          <h1 className={styles.title}>{data.pageTitle}</h1>
          <p className={styles.intro}>{data.intro}</p>

          <div className={styles.card}>
            <span className={styles.label}>{data.emailLabel}</span>
            <a href={`mailto:${data.emailPlaceholder}`} className={styles.email}>
              {data.emailPlaceholder}
            </a>
          </div>

          <p className={styles.note}>{data.responseNote}</p>
          <p className={styles.draftNotice}>{data.draftNotice}</p>
        </div>
      </Container>
    </>
  );
}
