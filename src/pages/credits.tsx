import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import Container from '@/components/Container';
import { useCredits } from '@/hooks/useCredits';
import { isAdminUser, isPremiumUser } from '@/lib/premium';
import { CREDIT_PACKAGES, PREMIUM_PLANS, formatTry, perCreditKurus, yearlyFreeMonths } from '@/config/creditPackages';
import styles from './credits.module.scss';


const STEPS = ['how1', 'how2', 'how3'];
const FAQ_KEYS = ['1', '2', '3', '4'];
const FREE_KEYS = ['free1', 'free2', 'free3'];

export default function CreditsPage() {
  const { t } = useTranslation('credits');
  const { authenticated, loading, credits } = useCredits();
  const { data: session } = useSession();
  const premium = authenticated && isPremiumUser({ premiumUntil: session?.user?.premiumUntil });
  const admin = authenticated && isAdminUser(session?.user);

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
                  {admin ? <span className={styles.adminBadge}>{t('adminActive')}</span> : null}
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
                <div key={pkg.key} className={`${styles.pricingCard} ${pkg.featured ? styles.pricingCardFeatured : ''}`.trim()}>
                  {pkg.featured && <div className={styles.pricingPopular}>{t('popularBadge')}</div>}
                  <div className={styles.pricingAmount}>
                    {pkg.credits}
                    <span className={styles.pricingUnit}>{t('creditsUnit')}</span>
                  </div>
                  <div className={styles.pricingPrice}>{formatTry(pkg.priceKurus)}</div>
                  <div className={styles.pricingPer}>{t('perCredit', { price: formatTry(perCreditKurus(pkg)) })}</div>
                  <button type="button" className={styles.buyBtn} disabled>
                    {t('buyDisabled')}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.pricingSection}>
            <h2 className={styles.sectionTitle}>{t('premiumTitle')}</h2>
            <p className={styles.premiumSub}>{t('premiumSub')}</p>
            <div className={styles.pricingCards}>
              {PREMIUM_PLANS.map((plan) => (
                <div key={plan.key} className={`${styles.pricingCard} ${styles.pricingCardPremium}`}>
                  {plan.key === 'yearly' ? <div className={styles.pricingPopular}>{t('yearlyFree', { months: yearlyFreeMonths() })}</div> : null}
                  <div className={styles.pricingPlan}>{t(plan.key === 'monthly' ? 'premiumMonthly' : 'premiumYearly')}</div>
                  <div className={styles.pricingPrice}>
                    {formatTry(plan.priceKurus)} <span className={styles.pricingPer}>{t(plan.key === 'monthly' ? 'perMonth' : 'perYear')}</span>
                  </div>
                  <p className={styles.premiumNote}>{t('premiumNote')}</p>
                  <button type="button" className={styles.buyBtn} disabled>
                    {t('buyDisabled')}
                  </button>
                </div>
              ))}
            </div>
            <p className={styles.vatNote}>{t('vatIncluded')}</p>
          </section>

          <section className={styles.howSection}>
            <h2 className={styles.sectionTitle}>{t('freeTitle')}</h2>
            <ul className={styles.freeList}>
              {FREE_KEYS.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
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
