import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
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
    <MatchHubPage
      sidebarLeagues={SIDEBAR_LEAGUES}
      defaultCompetitionId={DEFAULT_COMPETITION_ID}
      allowedCompetitionIds={null}
      initialDefaultHubData={initialDefaultHubData}
    />
  );
}

export const getServerSideProps: GetServerSideProps<HomeProps> = async (ctx) => {
  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=30, stale-while-revalidate=120'
  );
  const iso = new Date().toISOString().slice(0, 10);
  const raw = await loadMatchHubHomeInitialData(ctx.req, DEFAULT_COMPETITION_ID, iso);
  return {
    props: {
      initialDefaultHubData: raw == null ? null : propsJsonSafe(raw),
    },
  };
};
