import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from './auth.module.scss';

export default function VerifyEmailSentPage() {
  const router = useRouter();
  const email = typeof router.query.email === 'string' ? router.query.email : '';

  return (
    <>
      <Head>
        <title>E-postanı Doğrula — Ofsayt Yok</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>E-postanı Doğrula</h1>
          <p className={styles.footer}>
            <strong>{email || 'E-posta adresine'}</strong> bir doğrulama bağlantısı gönderdik.
            Gelen kutunu kontrol et ve bağlantıya tıklayarak hesabını aktif et.
          </p>
          <p className={styles.footer} style={{ marginTop: 8 }}>
            Mail gelmedi mi? Spam/gereksiz klasörünü kontrol et.
          </p>
          <p className={styles.footer} style={{ marginTop: 16 }}>
            <Link href="/auth/signin" className={styles.link}>
              Giriş Yap
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
