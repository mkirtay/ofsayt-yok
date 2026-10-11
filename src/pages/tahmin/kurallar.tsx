import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import JsonLd from '@/components/JsonLd';
import { FAQ_KEYS, Faq, GameNav, RulesList, ScoringTable } from '@/components/Game/Info';
import styles from '@/components/Game/game.module.scss';
import { GAME_BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';

/** Kurallar ve puanlama (statik). Puan değerleri lib/game/scoring.ts'ten. */
export const getStaticProps: GetStaticProps = async () => ({ props: {} });

export default function GameRulesPage() {
  const { t } = useTranslation('game');
  const url = `${siteBaseUrl()}${GAME_BRAND.basePath}/kurallar`;
  return (
    <>
      <Head>
        <title>{t('rulesTitle')}</title>
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
