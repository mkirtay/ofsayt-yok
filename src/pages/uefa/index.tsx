import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import MatchHubPage from '@/components/MatchHubPage';
import {
  UEFA_CHAMPIONS_LEAGUE_ID,
  UEFA_SIDEBAR_LEAGUES,
  UEFA_TIER2_COMPETITION_IDS,
} from '@/config/leagues';
import { loadUefaHubInitialData } from '@/server/loadUefaHubInitialData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import type { UefaHubInitialServerPayload } from '@/types/uefaHubSsr';

type UefaPageProps = {
  initialUefaHubData: UefaHubInitialServerPayload | null;
};

export default function UefaPage({
  initialUefaHubData,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>UEFA Maçları | Ofsayt Yok</title>
        <meta name="description" content="UEFA Şampiyonlar Ligi, Avrupa Ligi ve Konferans Ligi maçları, canlı skorlar ve sonuçları." />
        <meta property="og:title" content="UEFA Maçları | Ofsayt Yok" />
        <meta property="og:description" content="UEFA Şampiyonlar Ligi, Avrupa Ligi ve Konferans Ligi maçları, canlı skorlar ve sonuçları." />
        <meta property="og:url" content="https://ofsaytyok.com/uefa" />
        <link rel="canonical" href="https://ofsaytyok.com/uefa" />
      </Head>
      <MatchHubPage
      sidebarLeagues={UEFA_SIDEBAR_LEAGUES}
      defaultCompetitionId={UEFA_CHAMPIONS_LEAGUE_ID}
      allowedCompetitionIds={UEFA_TIER2_COMPETITION_IDS}
      mode="uefa"
      initialUefaHubData={initialUefaHubData}
    />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<UefaPageProps> = async (ctx) => {
  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=30, stale-while-revalidate=120'
  );

  const raw = await loadUefaHubInitialData(ctx.req, UEFA_CHAMPIONS_LEAGUE_ID);

  return {
    props: {
      initialUefaHubData: raw == null ? null : propsJsonSafe(raw),
    },
  };
};
