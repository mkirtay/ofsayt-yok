import Head from 'next/head';
import JsonLd from '@/components/JsonLd';
import MatchHubPage from '@/components/MatchHubPage';
import { SIDEBAR_LEAGUES } from '@/config/leagues';

const DEFAULT_COMPETITION_ID = 6;

export default function Home() {
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
      />
    </>
  );
}
