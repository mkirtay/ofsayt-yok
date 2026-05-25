import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Container from '@/components/Container';
import { usePremium } from '@/hooks/usePremium';
import styles from './premium.module.scss';

export default function PremiumPage() {
  const { t } = useTranslation('premium');
  const { isPremium, loading } = usePremium();
  const { data: session } = useSession();
  const router = useRouter();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState('');

  const paymentStatus = router.query.payment;

  const FEATURES = [
    {
      icon: '🤖',
      key: 'aiAnalysis',
      bullets: ['b1', 'b2', 'b3', 'b4', 'b5'],
    },
    {
      icon: '⚡',
      key: 'trivia',
      bullets: ['b1', 'b2', 'b3', 'b4'],
    },
    {
      icon: '📊',
      key: 'aiAccuracy',
      bullets: ['b1', 'b2', 'b3', 'b4'],
    },
  ];

  const COMPARE_ROWS: { key: string; free: boolean }[] = [
    { key: 'liveScores', free: true },
    { key: 'standings', free: true },
    { key: 'teamPages', free: true },
    { key: 'comments', free: true },
    { key: 'poll', free: true },
    { key: 'aiAnalysis', free: false },
    { key: 'trivia', free: false },
    { key: 'aiHistory', free: false },
  ];

  const FAQ_KEYS = ['1', '2', '3', '4'];

  async function startCheckout(plan: 'monthly' | 'yearly') {
    if (!session) {
      void router.push(`/auth/signin?callbackUrl=/premium`);
      return;
    }
    setCheckoutLoading(plan);
    setCheckoutError('');
    try {
      const res = await fetch('/api/payment/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setCheckoutError(data.error || t('paymentFailed'));
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError(t('paymentFailed'));
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/premium`} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/premium`} />
        <meta property="og:image" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/images/logo.svg`} />
        <meta property="og:type" content="website" />
      </Head>

      <Container>
        <div className={styles.page}>
          {!loading && isPremium && (
            <div className={styles.alreadyPremium}>
              <h3>{t('alreadyPremium')}</h3>
              <p>{t('alreadyPremiumDesc')}</p>
            </div>
          )}

          {paymentStatus === 'success' && (
            <div className={styles.alreadyPremium}>
              <h3>{t('paymentSuccess')}</h3>
              <p>{t('paymentSuccessDesc')}</p>
            </div>
          )}
          {paymentStatus === 'cancelled' && (
            <div className={styles.checkoutError}>{t('paymentCancelled')}</div>
          )}
          {checkoutError && (
            <div className={styles.checkoutError}>{checkoutError}</div>
          )}

          {/* Hero */}
          <section className={styles.hero}>
            <div className={styles.heroBadge}>{t('heroBadge')}</div>
            <h1 className={styles.heroTitle}>{t('heroTitle')}</h1>
            <p className={styles.heroSub}>{t('heroSub')}</p>
          </section>

          {/* Features */}
          <section>
            <h2 className={styles.sectionTitle}>{t('whatsPremium')}</h2>
            <div className={styles.featuresGrid}>
              {FEATURES.map((f) => (
                <div key={f.key} className={styles.featureCard}>
                  <span className={styles.featureCardIcon}>{f.icon}</span>
                  <div className={styles.featureCardTitle}>{t(`features.${f.key}.title`)}</div>
                  <p className={styles.featureCardDesc}>{t(`features.${f.key}.desc`)}</p>
                  <ul className={styles.featureCardBullets}>
                    {f.bullets.map((b) => (
                      <li key={b}>{t(`features.${f.key}.${b}`)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Compare table */}
          <section className={styles.compareWrap}>
            <h2 className={styles.sectionTitle}>{t('freeVsPremium')}</h2>
            <table className={styles.compareTable}>
              <thead className={styles.tableHead}>
                <tr>
                  <th>{t('compareFeature')}</th>
                  <th>{t('compareFree')}</th>
                  <th>
                    <span className={styles.premiumHeader}>⭐ Premium</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td>{t(`compareRows.${row.key}`)}</td>
                    <td className={row.free ? styles.hit : styles.miss}>
                      {row.free ? '✓' : '—'}
                    </td>
                    <td className={`${styles.premiumCol} ${styles.hit}`}>✓</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Pricing */}
          <section className={styles.pricingSection}>
            <h2 className={styles.sectionTitle}>{t('pricingTitle')}</h2>
            <div className={styles.pricingCards}>
              {/* Monthly */}
              <div className={styles.pricingCard}>
                <div className={styles.pricingPeriod}>{t('monthly')}</div>
                <div className={styles.pricingAmount}>
                  <sup>₺</sup>79<sub>/ay</sub>
                </div>
                <div className={styles.pricingNote}>&nbsp;</div>
                <ul className={styles.pricingFeatures}>
                  <li>{t('allAiFeatures')}</li>
                  <li>{t('unlimitedAnalysis')}</li>
                  <li>{t('cancelAnytime')}</li>
                </ul>
                {!isPremium && (
                  <button
                    type="button"
                    className={styles.buyBtn}
                    onClick={() => void startCheckout('monthly')}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === 'monthly' ? t('redirecting') : t('buy')}
                  </button>
                )}
                {!isPremium && !session && (
                  <p className={styles.loginNote}>
                    <Link href="/auth/signin?callbackUrl=/premium">{t('signIn')}</Link> {t('signInToBuy')}
                  </p>
                )}
              </div>

              {/* Yearly */}
              <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
                <div className={styles.pricingPopular}>{t('mostPopular')}</div>
                <div className={styles.pricingPeriod}>{t('yearly')}</div>
                <div className={styles.pricingAmount}>
                  <sup>₺</sup>699<sub>/yıl</sub>
                </div>
                <div className={styles.pricingNote}>{t('yearlyNote')}</div>
                <ul className={styles.pricingFeatures}>
                  <li>{t('allAiFeatures')}</li>
                  <li>{t('unlimitedAnalysis')}</li>
                  <li>{t('prioritySupport')}</li>
                  <li>{t('earlyAccess')}</li>
                </ul>
                {!isPremium && (
                  <button
                    type="button"
                    className={`${styles.buyBtn} ${styles.buyBtnFeatured}`}
                    onClick={() => void startCheckout('yearly')}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === 'yearly' ? t('redirecting') : t('buy')}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* FAQ */}
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
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'premium'])),
  },
});
