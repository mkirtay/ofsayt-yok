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
import { gamePageGate } from '@/server/game/access';

type Props = GameHomeData & { noindex: boolean };

/**
 * Tahmin oyunu ana sayfası: hero → haftanın maçları (form) → 3 adım → nasıl oynanır → canlı sıralama (sezon ilk 10) → SSS → CTA.
 * ScoreHunter landing iskeletinden esinli (ödül / uygulama ekranı bölümleri yok). SSR verisi kişisel değil → CDN 60 sn.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  // GAME_ENABLED kapısı (config/gameFlag.ts): kapalı / önizlemede yetkisiz → 404.
  const gate = await gamePageGate(req, res);
  if (!gate) return { notFound: true };
  if (gate.publicCache) res.setHeader('Cache-Control', GAME_PAGE_CACHE);
  return { props: propsJsonSafe({ ...(await loadGameHome()), noindex: gate.noindex }) };
};

export default function GameHomePage({ week, season, board, prevKey, nextKey, renderedAt, noindex }: Props) {
  const { t } = useTranslation('game');
  const { status } = useSession();
  const SITE = siteBaseUrl();
  const url = `${SITE}${GAME_BRAND.basePath}`;
  const startLogin = () => void signIn('google', { callbackUrl: `${GAME_BRAND.basePath}#hafta` });

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
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
      <div className={`${styles.page} ${styles.pageWide}`}>
        <GameNav current="play" />

        {/* İki sütun (≥ $bp-desktop): solda tahmin akışı, sağda ana sayfa Gündem paneli genişliğinde (360 px) yapışkan yan sütun.
            Mobilde tek sütun: maçlar → nasıl oynanır + sıralama → SSS. */}
        <div className={styles.layout}>
          <div className={styles.layoutMain}>
            {week ? (
              <WeekPlay week={week} prevKey={prevKey} nextKey={nextKey} renderedAt={renderedAt} />
            ) : (
              <>
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
                    {status === 'unauthenticated' ? (
                      <button type="button" className={styles.btnGold} onClick={startLogin}>
                        {t('hero.ctaLogin')}
                      </button>
                    ) : null}
                    <a href="#nasil" className={styles.linkOnDark}>
                      {t('hero.howLink')}
                    </a>
                  </div>
                </header>
                <section id="hafta" className={styles.section}>
                  <h2 className={styles.h2}>{t('week.title')}</h2>
                  <p className={`${styles.card} ${styles.muted}`}>{t('week.none')}</p>
                </section>
              </>
            )}
          </div>
          <aside className={styles.layoutSide} aria-label={t('how.title')}>
            <HowToPlay />
            <Leaderboard weekKey={null} season={season} initial={board} initialScope="season" limit={10} title={t('board.top')} />
          </aside>
          <div className={styles.layoutRest}>
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
        </div>
      </div>
    </>
  );
}
