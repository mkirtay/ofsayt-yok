import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { signIn, useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import JsonLd from '@/components/JsonLd';
import WeekPlay from '@/components/Game/WeekPlay';
import Leaderboard from '@/components/Game/Leaderboard';
import { FAQ_KEYS, Faq, GameNav, HowToPlay } from '@/components/Game/Info';
import styles from '@/components/Game/game.module.scss';
import { GAME_BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import { GAME_PAGE_CACHE, loadGameHome, type GameHomeData } from '@/server/game/pageData';

/**
 * Tahmin oyunu ana sayfası: hero → haftanın maçları (form) → 3 adım → nasıl oynanır → canlı sıralama (sezon ilk 10) → SSS → CTA.
 * ScoreHunter landing iskeletinden esinli (ödül / uygulama ekranı bölümleri yok). SSR verisi kişisel değil → CDN 60 sn.
 */
export const getServerSideProps: GetServerSideProps<GameHomeData> = async ({ res }) => {
  res.setHeader('Cache-Control', GAME_PAGE_CACHE);
  return { props: propsJsonSafe(await loadGameHome()) };
};

export default function GameHomePage({ week, season, board, prevKey, nextKey }: GameHomeData) {
  const { t } = useTranslation('game');
  const { status } = useSession();
  const SITE = siteBaseUrl();
  const url = `${SITE}${GAME_BRAND.basePath}`;
  const startLogin = () => void signIn('google', { callbackUrl: `${GAME_BRAND.basePath}#hafta` });

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={url} />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ_KEYS.map((n) => ({ '@type': 'Question', name: t(`faq.q${n}`), acceptedAnswer: { '@type': 'Answer', text: t(`faq.a${n}`) } })),
        }}
      />
      <div className={styles.page}>
        <GameNav current="play" />

        <header className={styles.hero}>
          <svg className={styles.heroDeco} viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#fff" strokeWidth="3" />
            <circle cx="100" cy="100" r="28" fill="none" stroke="#fff" strokeWidth="3" />
            <line x1="10" y1="100" x2="190" y2="100" stroke="#fff" strokeWidth="3" />
          </svg>
          <p className={styles.kicker}>{GAME_BRAND.name}</p>
          <h1 className={styles.heroTitle}>{t('hero.title')}</h1>
          <p className={styles.heroSub}>{t('hero.sub')}</p>
          <div className={styles.heroActions}>
            {status !== 'unauthenticated' ? (
              <a href="#hafta" className={styles.btnGold}>
                {t('hero.ctaPlay')}
              </a>
            ) : (
              <button type="button" className={styles.btnGold} onClick={startLogin}>
                {t('hero.ctaLogin')}
              </button>
            )}
            <a href="#nasil" className={styles.linkOnDark}>
              {t('hero.howLink')}
            </a>
          </div>
        </header>

        {week ? (
          <WeekPlay week={week} prevKey={prevKey} nextKey={nextKey} />
        ) : (
          <section id="hafta" className={styles.section}>
            <h2 className={styles.h2}>{t('week.title')}</h2>
            <p className={`${styles.card} ${styles.muted}`}>{t('week.none')}</p>
          </section>
        )}

        <section className={styles.section} aria-labelledby="game-steps-title">
          <h2 id="game-steps-title" className={styles.h2}>
            {t('steps.title')}
          </h2>
          <ol className={styles.steps}>
            {(['s1', 's2', 's3'] as const).map((s) => (
              <li key={s}>
                <h3>{t(`steps.${s}.title`)}</h3>
                <p>{t(`steps.${s}.text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <HowToPlay />

        <Leaderboard weekKey={null} season={season} initial={board} initialScope="season" limit={10} title={t('board.top')} />

        <Faq />

        <section className={styles.ctaBand}>
          <h2>{t('cta.title')}</h2>
          <p>{t('cta.free')}</p>
          {status !== 'unauthenticated' ? (
            <a href="#hafta" className={styles.btnGold}>
              {t('cta.button')}
            </a>
          ) : (
            <button type="button" className={styles.btnGold} onClick={startLogin}>
              {t('cta.button')}
            </button>
          )}
        </section>
      </div>
    </>
  );
}
