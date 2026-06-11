import Head from 'next/head';
import MatchHubPage from '@/components/MatchHubPage';
import {
  UEFA_CHAMPIONS_LEAGUE_ID,
  UEFA_SIDEBAR_LEAGUES,
  UEFA_TIER2_COMPETITION_IDS,
} from '@/config/leagues';

export default function UefaPage() {
  return (
    <>
      <Head>
        <title>UEFA Maçları | Ofsayt Yok</title>
        <meta name="description" content="UEFA Şampiyonlar Ligi, Avrupa Ligi ve Konferans Ligi maçları, canlı skorlar ve sonuçları." />
        <meta property="og:title" content="UEFA Maçları | Ofsayt Yok" />
        <meta property="og:description" content="UEFA Şampiyonlar Ligi, Avrupa Ligi ve Konferans Ligi maçları, canlı skorlar ve sonuçları." />
        <meta property="og:url" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/uefa`} />
        <link rel="canonical" href={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/uefa`} />
      </Head>
      <MatchHubPage
        sidebarLeagues={UEFA_SIDEBAR_LEAGUES}
        defaultCompetitionId={UEFA_CHAMPIONS_LEAGUE_ID}
        allowedCompetitionIds={UEFA_TIER2_COMPETITION_IDS}
        mode="uefa"
      />
    </>
  );
}
