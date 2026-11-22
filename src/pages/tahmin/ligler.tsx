import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { GameNav } from '@/components/Game/Info';
import { MyLeagues } from '@/components/Game/PrivateLeagues';
import styles from '@/components/Game/game.module.scss';
import '@/lib/i18nNamespaces/game';
import { gamePageGate } from '@/server/game/access';
import { privateLeaguesEnabled } from '@/server/game/leagues';
import { GAME_BRAND } from '@/config/brand';

/** Özel ligler (büyüme raporu 2.2): kur / kodla katıl / liglerim. Kişisel sayfa → noindex, önbellek yok. */
export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  if (!privateLeaguesEnabled()) return { notFound: true };
  const gate = await gamePageGate(req, res);
  if (!gate) return { notFound: true };
  res.setHeader('Cache-Control', 'private, no-store');
  return { props: {} };
};

export default function GameLeaguesPage() {
  return (
    <>
      <Head>
        <title>{`Özel Ligler · ${GAME_BRAND.name}`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.page}>
        <GameNav current="leagues" />
        <MyLeagues />
      </div>
    </>
  );
}
