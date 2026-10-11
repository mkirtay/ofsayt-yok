import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import JsonLd from '@/components/JsonLd';
import { FAQ_KEYS, Faq, GameNav, RulesList, ScoringTable } from '@/components/Game/Info';
import styles from '@/components/Game/game.module.scss';
import { GAME_BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import { GAME_PAGE_CACHE } from '@/server/game/pageData';
import { gamePageGate } from '@/server/game/access';

/** Kurallar ve puanlama. Puan değerleri lib/game/scoring.ts'ten. SSR: GAME_ENABLED kapısı istek anında karar verir. */
export const getServerSideProps: GetServerSideProps<{ noindex: boolean }> = async ({ req, res }) => {
  const gate = await gamePageGate(req, res);
  if (!gate) return { notFound: true };
  if (gate.publicCache) res.setHeader('Cache-Control', GAME_PAGE_CACHE);
  return { props: { noindex: gate.noindex } };
};

export default function GameRulesPage({ noindex }: { noindex: boolean }) {
  const { t } = useTranslation('game');
  const url = `${siteBaseUrl()}${GAME_BRAND.basePath}/kurallar`;
  return (
    <>
      <Head>
        <title>{t('rulesTitle')}</title>
        {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={url} />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ_KEYS.map((n) => ({ '@type': 'Question', name: t(`faq.q${n}`), acceptedAnswer: { '@type': 'Answer', text: t(`faq.a${n}`) } })),
        }}
      />
      <div className={styles.page}>
        <GameNav current="rules" />
        <section className={styles.section}>
          <h1 className={styles.h2}>{t('rules.title')}</h1>
          <ScoringTable />
          <div className={styles.card}>
            <RulesList />
          </div>
        </section>
        <Faq />
      </div>
    </>
  );
}
