import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';
import Container from '@/components/Container';
import styles from './footer.module.scss';

export default function Footer() {
  const { t } = useTranslation('common');
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container className={styles.footerContainer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <Image
              src="/images/logo.svg"
              alt="Ofsayt Yok"
              width={120}
              height={23}
              className={styles.footerLogo}
            />
            <p className={styles.footerTagline}>{t('footer.tagline')}</p>
          </div>

          <div className={styles.footerLinksCol}>
            <span className={styles.footerLinksHeading}>{t('footer.linksHeading')}</span>
            <nav className={styles.footerLinks} aria-label={t('footer.linksHeading')}>
              <Link href="/gizlilik-politikasi" className={styles.footerLink}>
                {t('footer.privacyPolicy')}
              </Link>
              <Link href="/kullanim-sartlari" className={styles.footerLink}>
                {t('footer.termsOfUse')}
              </Link>
              <Link href="/iletisim" className={styles.footerLink}>
                {t('footer.contact')}
              </Link>
            </nav>
          </div>
        </div>

        <p className={styles.footerDisclaimer}>{t('footer.disclaimer')}</p>

        <div className={styles.footerBottom}>
          <span>{t('footer.copyright', { year })}</span>
        </div>
      </Container>
    </footer>
  );
}
