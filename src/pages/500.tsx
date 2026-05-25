import Head from 'next/head';
import { useI18n } from '@/lib/i18n';
import Container from '@/components/Container';
import styles from './error.module.scss';

const STRINGS = {
  tr: {
    title: 'Sunucu Hatası | Ofsayt Yok',
    heading: 'Bir Şeyler Ters Gitti',
    desc: 'Sunucumuzda beklenmedik bir hata oluştu. Lütfen sayfayı yenileyin.',
    refresh: 'Sayfayı Yenile',
  },
  en: {
    title: 'Server Error | Ofsayt Yok',
    heading: 'Something Went Wrong',
    desc: 'An unexpected error occurred on our server. Please refresh the page.',
    refresh: 'Refresh Page',
  },
};

export default function ServerError() {
  const { locale } = useI18n();
  const s = locale === 'en' ? STRINGS.en : STRINGS.tr;

  return (
    <>
      <Head>
        <title>{s.title}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container>
        <div className={styles.wrapper}>
          <div className={styles.code}>500</div>
          <h1 className={styles.title}>{s.heading}</h1>
          <p className={styles.desc}>{s.desc}</p>
          <button
            type="button"
            className={styles.btn}
            onClick={() => window.location.reload()}
          >
            {s.refresh}
          </button>
        </div>
      </Container>
    </>
  );
}
