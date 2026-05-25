import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import Head from 'next/head';
import JsonLd from '@/components/JsonLd';
import MatchHubPage from '@/components/MatchHubPage';
import { SIDEBAR_LEAGUES } from '@/config/leagues';
import { loadMatchHubHomeInitialData } from '@/server/loadMatchHubHomeInitialData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import type { MatchHubHomeInitialServerPayload } from '@/types/matchHubHomeSsr';

const DEFAULT_COMPETITION_ID = 6;

type HomeProps = {
  initialDefaultHubData: MatchHubHomeInitialServerPayload | null;
};

export default function Home({
  initialDefaultHubData,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>Ofsayt Yok — Canlı Maç Sonuçları & Analiz</title>
        <meta name="description" content="Türkiye Süper Lig, UEFA ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri." />
        <meta property="og:title" content="Ofsayt Yok — Canlı Maç Sonuçları & Analiz" />
        <meta property="og:description" content="Türkiye Süper Lig, UEFA ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri." />
        <meta property="og:url" content={process.env.AUTH_URL ?? 'https://ofsaytyok.app'} />
        <link rel="canonical" href={process.env.AUTH_URL ?? 'https://ofsaytyok.app'} />
        <JsonLd schema={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Ofsayt Yok',
          url: process.env.AUTH_URL ?? 'https://ofsaytyok.app',
          logo: `${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/images/logo.svg`,
          description: 'Türkiye ve dünya futbolundan canlı skorlar, maç analizleri, puan durumu ve spor haberleri.',
        }} />
      </Head>
      <MatchHubPage
      sidebarLeagues={SIDEBAR_LEAGUES}
      defaultCompetitionId={DEFAULT_COMPETITION_ID}
      allowedCompetitionIds={null}
      initialDefaultHubData={initialDefaultHubData}
    />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async (ctx) => {
  try {
    ctx.res.setHeader(
      'Cache-Control',
      'public, s-maxage=30, stale-while-revalidate=120'
    );
    const iso = new Date().toISOString().slice(0, 10);
    const raw = await loadMatchHubHomeInitialData(ctx.req, DEFAULT_COMPETITION_ID, iso);
    const i18nProps = await serverSideTranslations(ctx.locale ?? 'tr', ['common', 'nav', 'match']);
    return {
      props: {
        ...i18nProps,
        initialDefaultHubData: raw == null ? null : propsJsonSafe(raw),
      },
    };
  } catch (e) {
    console.error('index getServerSideProps', e);
    const i18nProps = await serverSideTranslations(ctx.locale ?? 'tr', ['common', 'nav', 'match']);
    return { props: { ...i18nProps, initialDefaultHubData: null } };
  }
};
