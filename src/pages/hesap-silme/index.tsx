import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import RequestForm from '@/components/AccountDeletion/RequestForm';
import { ACCOUNT_DELETION_PATH, PROFILE_DELETE_HREF, useAccountDeletionText } from '@/components/AccountDeletion/content';
import styles from '@/components/AccountDeletion/accountDeletion.module.scss';
import { siteBaseUrl } from '@/lib/siteUrl';
import { BRAND, brandTitle } from '@/config/brand';

/**
 * Herkese açık hesap silme sayfası (Google Play Data Safety "hesap silme URL'si"; giriş gerektirmez, dizine açık).
 * İki yol: giriş yapabilen Profil › Hesabı sil; yapamayan e-posta onay bağlantısı (server/account/deletionRequest.ts).
 */
export default function HesapSilmePage() {
  const { text, locale } = useAccountDeletionText();
  const p = text.page;

  return (
    <>
      <Head>
        <title>{brandTitle(p.pageTitle, '—')}</title>
        <meta name="description" content={p.pageDesc} />
        <link rel="canonical" href={`${siteBaseUrl()}${ACCOUNT_DELETION_PATH}`} />
      </Head>
      <Container>
        <div className={styles.page}>
          <Link href="/" className={styles.backLink}>
            {text.backHome}
          </Link>
          <h1 className={styles.title}>{p.pageTitle}</h1>
          <p className={styles.intro}>{p.intro}</p>
          <p className={styles.meta}>{p.developer}</p>

          <div className={styles.paths}>
            <section className={styles.card} aria-labelledby="hs-signed-in">
              <h2 id="hs-signed-in" className={styles.cardHeading}>
                {p.signedIn.heading}
              </h2>
              <p className={styles.body}>{p.signedIn.body}</p>
              <Link href={PROFILE_DELETE_HREF} className={styles.secondaryButton}>
                {p.signedIn.cta}
              </Link>
            </section>

            <section className={styles.card} aria-labelledby="hs-signed-out">
              <h2 id="hs-signed-out" className={styles.cardHeading}>
                {p.signedOut.heading}
              </h2>
              <p className={styles.body}>{p.signedOut.body}</p>
              <RequestForm text={p.signedOut} locale={locale} />
            </section>
          </div>

          <div className={styles.sections}>
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>{p.deletedHeading}</h2>
              <ul className={styles.list}>
                {p.deleted.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>{p.anonymizedHeading}</h2>
              <p className={styles.body}>{p.anonymized}</p>
            </section>
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>{p.retainedHeading}</h2>
              <p className={styles.body}>{p.retained}</p>
            </section>
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>{p.timingHeading}</h2>
              <p className={styles.body}>{p.timing}</p>
            </section>
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>{p.contactHeading}</h2>
              <p className={styles.body}>{p.contact}</p>
              <a href={`mailto:${BRAND.contactEmail}`} className={styles.contactLink}>
                {BRAND.contactEmail}
              </a>
            </section>
          </div>
        </div>
      </Container>
    </>
  );
}
