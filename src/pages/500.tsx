import Head from 'next/head';
import Container from '@/components/Container';
import styles from './error.module.scss';

export default function ServerError() {
  return (
    <>
      <Head>
        <title>Sunucu Hatası | Ofsayt Yok</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container>
        <div className={styles.wrapper}>
          <div className={styles.code}>500</div>
          <h1 className={styles.title}>Bir Şeyler Ters Gitti</h1>
          <p className={styles.desc}>
            Sunucumuzda beklenmedik bir hata oluştu. Lütfen sayfayı yenileyin.
          </p>
          <button
            type="button"
            className={styles.btn}
            onClick={() => window.location.reload()}
          >
            Sayfayı Yenile
          </button>
        </div>
      </Container>
    </>
  );
}
