import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import Container from '@/components/Container';
import { useCredits } from '@/hooks/useCredits';
import { isPremiumUser } from '@/lib/premium';
import { CREDIT_PACKAGES, PREMIUM_PACKAGE_KEY } from '@/config/creditPackages';
import styles from './credits.module.scss';


const STEPS = ['how1', 'how2', 'how3'];
const FAQ_KEYS = ['1', '2', '3'];

export default function CreditsPage() {
  const { t } = useTranslation('credits');
  const { authenticated, loading, credits } = useCredits();
  const { data: session } = useSession();
  const premium = authenticated && isPremiumUser({ role: session?.user?.role, credits });

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/credits`} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/credits`} />
      </Head>

      <Container>
        <div className={styles.page}>
          <section className={styles.hero}>
            <div className={styles.heroBadge}>{t('heroBadge')}</div>
            <h1 className={styles.heroTitle}>{t('heroTitle')}</h1>
            <p className={styles.heroSub}>{t('heroSub')}</p>

            <div className={styles.balanceCard}>
              {!loading && authenticated ? (
                <>
                  <span className={styles.balanceLabel}>{t('balanceLabel')}</span>
                  <span className={styles.balanceValue}>
                    {credits} <span className={styles.balanceUnit}>{t('balanceUnit')}</span>
                  </span>
                  {premium ? <span className={styles.premiumBadge}>{t('premiumActive')}</span> : null}
                </>
              ) : (
                <span className={styles.signInNote}>{t('signInNote')}</span>
              )}
            </div>
          </section>

          <section className={styles.pricingSection}>
            <h2 className={styles.sectionTitle}>{t('packagesTitle')}</h2>
            <p className={styles.comingSoonBanner}>{t('comingSoon')}</p>
            <div className={styles.pricingCards}>
              {CREDIT_PACKAGES.map((pkg) => (
                <div
                  key={pkg.key}
                  className={`${styles.pricingCard} ${pkg.featured ? styles.pricingCardFeatured : ''} ${pkg.key === PREMIUM_PACKAGE_KEY ? styles.pricingCardPremium : ''}`.trim()}
                >
                  {pkg.featured && <div className={styles.pricingPopular}>★</div>}
                  <div className={styles.pricingAmount}>
                    {pkg.credits}
                    <span className={styles.pricingUnit}>{t('creditsUnit')}</span>
                  </div>
                  <button type="button" className={styles.buyBtn} disabled>
                    {t('buyDisabled')}
                  </button>
                  {pkg.key === PREMIUM_PACKAGE_KEY ? <p className={styles.premiumNote}>{t('premiumNote')}</p> : null}
                </div>
              ))}
            </div>
          </section>

          <section className={styles.howSection}>
            <h2 className={styles.sectionTitle}>{t('howItWorksTitle')}</h2>
            <div className={styles.stepsGrid}>
              {STEPS.map((step, i) => (
                <div key={step} className={styles.stepCard}>
                  <div className={styles.stepNumber}>{i + 1}</div>
                  <div className={styles.stepTitle}>{t(`${step}Title`)}</div>
                  <p className={styles.stepDesc}>{t(`${step}Desc`)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.faqSection}>
            <h2 className={styles.sectionTitle}>{t('faqTitle')}</h2>
            {FAQ_KEYS.map((k) => (
              <div key={k} className={styles.faqItem}>
                <div className={styles.faqQ}>{t(`faqItems.q${k}`)}</div>
                <p className={styles.faqA}>{t(`faqItems.a${k}`)}</p>
              </div>
            ))}
          </section>
        </div>
      </Container>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'credits'])),
  },
});
