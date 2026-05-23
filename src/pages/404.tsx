import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import styles from './error.module.scss';

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Sayfa Bulunamadı | Ofsayt Yok</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Container>
        <div className={styles.wrapper}>
          <div className={styles.code}>404</div>
          <h1 className={styles.title}>Sayfa Bulunamadı</h1>
          <p className={styles.desc}>
            Aradığın sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.
          </p>
          <Link href="/" className={styles.btn}>
            Anasayfaya Dön
          </Link>
        </div>
      </Container>
    </>
  );
}
