import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import Container from '@/components/Container';
import styles from './footer.module.scss';
import BrandLogo from '@/components/BrandLogo';
import { LEGAL_PAGES, type LegalDocKey } from '@/config/legalPages';

/** Kurumsal: iletişim + hesabı ilgilendiren metinler; Yasal: KVKK, çerez ve satış metinleri. */
const CORPORATE_KEYS: readonly LegalDocKey[] = ['terms', 'community', 'privacy'];
const CORPORATE = LEGAL_PAGES.filter((p) => CORPORATE_KEYS.includes(p.docKey));
const LEGAL = LEGAL_PAGES.filter((p) => !CORPORATE_KEYS.includes(p.docKey));

export default function Footer() {
  const { t } = useTranslation('common');
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container className={styles.footerContainer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            {/* Footer her iki temada da koyu zeminli → koyu-zemin varyantı. */}
            <BrandLogo surface="dark" height={34} />
            <p className={styles.footerTagline}>{t('footer.tagline')}</p>
          </div>

          <div className={styles.footerLinkGroups}>
            <div className={styles.footerLinksCol}>
              <span className={styles.footerLinksHeading}>{t('footer.linksHeading')}</span>
              <nav className={styles.footerLinks} aria-label={t('footer.linksHeading')}>
                <Link href="/iletisim" className={styles.footerLink}>
                  {t('footer.contact')}
                </Link>
                {CORPORATE.map((p) => (
                  <Link key={p.path} href={p.path} className={styles.footerLink}>
                    {t(p.footerKey)}
                  </Link>
                ))}
                <Link href="/hesap-silme" className={styles.footerLink}>
                  {t('footer.accountDeletion')}
                </Link>
              </nav>
            </div>

            <div className={styles.footerLinksCol}>
              <span className={styles.footerLinksHeading}>{t('footer.legalHeading')}</span>
              <nav className={styles.footerLinks} aria-label={t('footer.legalHeading')}>
                {LEGAL.map((p) => (
                  <Link key={p.path} href={p.path} className={styles.footerLink}>
                    {t(p.footerKey)}
                  </Link>
                ))}
              </nav>
            </div>
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
