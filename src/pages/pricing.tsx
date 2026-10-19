import { useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import Container from '@/components/Container';
import { useCredits } from '@/hooks/useCredits';
import { isAdminUser } from '@/lib/userRole';
import { CREDIT_PACKAGES, formatTry, perCreditKurus } from '@/config/creditPackages';
import { TEST_PACKAGE_KEY, availablePackageKeys } from '@/config/paymentPackages';
import PaymentBuyButton from '@/components/PaymentBuyButton';
import styles from './pricing.module.scss';
import { siteBaseUrl } from '@/lib/siteUrl';
import { DISTANCE_SALES_PATH, PRE_INFO_PATH } from '@/config/legalConsent';
import PricingSampleAnalysis from '@/components/PricingSampleAnalysis';

const PRICING_PATH = '/pricing';

const GUIDE_STEPS = ['s1', 's2', 's3', 's4', 's5', 's6'];
const FAQ_KEYS = ['1', '2', '3', '4'];
const FREE_KEYS = ['free1', 'free2', 'free3'];
const CONSENT_ID = 'purchase-consent';

/** `availablePackages`: Hikie link + secret'ı tanımlı paketler (build anında; env değişince yeniden deploy gerekir). */
export default function PricingPage({ availablePackages = [] }: { availablePackages?: string[] }) {
  const { t } = useTranslation('credits');
  const buyLabels = {
    buy: t('buyNow'),
    loading: t('buyLoading'),
    soon: t('buyDisabled'),
    error: t('buyError'),
    unavailable: t('buyUnavailable'),
    termsRequired: t('consent.required'),
  };
  // Satın alma onayı: sayfa başına tek kutu, tüm paket düğmeleri buna bağlı (işaretlenmeden pasif).
  const [termsAccepted, setTermsAccepted] = useState(false);
  const buy = (packageKey: string) => (
    <PaymentBuyButton
      packageKey={packageKey}
      available={availablePackages.includes(packageKey)}
      termsAccepted={termsAccepted}
      describedBy={CONSENT_ID}
      labels={buyLabels}
      className={styles.buyBtn}
      activeClassName={styles.buyBtnActive}
      errorClassName={styles.buyError}
    />
  );
  const anyCreditOnSale = CREDIT_PACKAGES.some((p) => availablePackages.includes(p.paymentKey));
  const { authenticated, loading, credits } = useCredits();
  const { data: session } = useSession();
  const admin = authenticated && isAdminUser(session?.user);
  // Onay kutusu yalnız gerçekten satılan bir paket varken görünür (PAYMENTS_ENABLED kapalıyken sayfa değişmez).
  const anyOnSale = anyCreditOnSale || (admin && availablePackages.includes(TEST_PACKAGE_KEY));

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={`${siteBaseUrl()}${PRICING_PATH}`} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={`${siteBaseUrl()}${PRICING_PATH}`} />
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
                  {admin ? <span className={styles.adminBadge}>{t('adminActive')}</span> : null}
                </>
              ) : (
                <span className={styles.signInNote}>{t('signInNote')}</span>
              )}
            </div>
          </section>

          <div className={styles.split}>
            <div className={styles.splitMain}>
              <section className={styles.pricingSection}>
                <h2 className={styles.sectionTitle}>{t('packagesTitle')}</h2>
                {anyCreditOnSale ? null : <p className={styles.comingSoonBanner}>{t('comingSoon')}</p>}
                {anyOnSale ? (
                  <div className={styles.consent}>
                    <label className={styles.consentLabel}>
                      <input
                        id={CONSENT_ID}
                        type="checkbox"
                        className={styles.consentCheckbox}
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                      />
                      <span>
                        {t('consent.before')}
                        <Link href={PRE_INFO_PATH} target="_blank" rel="noopener" className={styles.consentLink}>
                          {t('consent.preInfo')}
                        </Link>
                        {t('consent.and')}
                        <Link href={DISTANCE_SALES_PATH} target="_blank" rel="noopener" className={styles.consentLink}>
                          {t('consent.contract')}
                        </Link>
                        {t('consent.after')}
                      </span>
                    </label>
                  </div>
                ) : null}
                <div className={styles.pricingCards}>
                  {CREDIT_PACKAGES.map((pkg) => (
                    <div
                      key={pkg.key}
                      className={`${styles.pricingCard} ${pkg.featured ? styles.pricingCardFeatured : ''}`.trim()}
                    >
                      {pkg.featured && <div className={styles.pricingPopular}>{t('popularBadge')}</div>}
                      <div className={styles.pricingAmount}>
                        {pkg.credits}
                        <span className={styles.pricingUnit}>{t('creditsUnit')}</span>
                      </div>
                      <div className={styles.pricingPrice}>{formatTry(pkg.priceKurus)}</div>
                      <div className={styles.pricingPer}>
                        {t('perCredit', {
                          price: formatTry(perCreditKurus(pkg)),
                        })}
                      </div>
                      {buy(pkg.paymentKey)}
                    </div>
                  ))}
                </div>
                <p className={styles.vatNote}>{t('vatIncluded')}</p>
              </section>

              {admin && availablePackages.includes(TEST_PACKAGE_KEY) ? (
                <section className={styles.pricingSection}>
                  <div className={`${styles.pricingCard} ${styles.testCard}`}>
                    <div className={styles.pricingPlan}>{t('testPackageTitle')}</div>
                    <p className={styles.premiumNote}>{t('testPackageDesc')}</p>
                    {buy(TEST_PACKAGE_KEY)}
                  </div>
                </section>
              ) : null}

              <section className={styles.howSection}>
                <h2 className={styles.sectionTitle}>{t('freeTitle')}</h2>
                <ul className={styles.freeList}>
                  {FREE_KEYS.map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ul>
              </section>
              <section className={styles.guideSection} aria-labelledby="pricing-guide">
                <h2 id="pricing-guide" className={styles.sectionTitle}>
                  {t('guide.title')}
                </h2>
                <ol className={styles.guideList}>
                  {GUIDE_STEPS.map((step, i) => (
                    <li key={step} className={styles.guideStep}>
                      <span className={styles.stepNumber} aria-hidden="true">
                        {i + 1}
                      </span>
                      <div>
                        <h3 className={styles.stepTitle}>{t(`guide.${step}Title`)}</h3>
                        <p className={styles.stepDesc}>{t(`guide.${step}Desc`)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className={styles.guideCtas}>
                  {authenticated ? null : (
                    <Link href="/auth/signup" className={styles.guideCtaPrimary}>
                      {t('guide.ctaSignup')}
                    </Link>
                  )}
                  <Link href="/" className={styles.guideCta}>
                    {t('guide.ctaMatches')}
                  </Link>
                  <Link href="/ai-istatistikleri" className={styles.guideCta}>
                    {t('guide.ctaAccuracy')}
                  </Link>
                </div>
              </section>
            </div>
            <aside className={styles.splitAside}>
              <PricingSampleAnalysis />
            </aside>
          </div>

          <section className={styles.faqSection}>
            <h2 className={styles.sectionTitle}>{t('faqTitle')}</h2>
            {FAQ_KEYS.map((k) => (
              <div key={k} className={styles.faqItem}>
                {/* İlk soru satış durumuna göre: kapalıyken "ne zaman", açıkken "nasıl ödeme yaparım". */}
                <div className={styles.faqQ}>{t(`faqItems.q${k}${k === '1' && anyCreditOnSale ? 'Live' : ''}`)}</div>
                <p className={styles.faqA}>{t(`faqItems.a${k}${k === '1' && anyCreditOnSale ? 'Live' : ''}`)}</p>
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
    // Yalnız "satışta mı" bilgisi; link ve secret istemciye gitmez.
    availablePackages: availablePackageKeys(),
  },
});
