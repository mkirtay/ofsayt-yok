import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import Leaderboard from '@/components/Game/Leaderboard';
import { GameNav } from '@/components/Game/Info';
import styles from '@/components/Game/game.module.scss';
import { GAME_BRAND } from '@/config/brand';
import type { LeaderboardView } from '@/lib/game/types';
import { seasonOf, weekKeyOf } from '@/lib/game/week';
import { siteBaseUrl } from '@/lib/siteUrl';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import { loadLeaderboard } from '@/server/game/play';
import { GAME_PAGE_CACHE } from '@/server/game/pageData';
import { resolveCurrentWeekKey } from '@/server/game/weeks';

type Props = { weekKey: string | null; season: string; board: LeaderboardView | null };

/** Sıralama: bu hafta / sezon (ilk 50). İlk sekme haftalık; hafta yoksa sezon. */
export const getServerSideProps: GetServerSideProps<Props> = async ({ res }) => {
  res.setHeader('Cache-Control', GAME_PAGE_CACHE);
  const weekKey = await resolveCurrentWeekKey();
  const season = (weekKey && seasonOf(weekKey)) || seasonOf(weekKeyOf(Date.now()))!;
  const board = weekKey ? await loadLeaderboard('week', weekKey) : await loadLeaderboard('season', season);
  return { props: propsJsonSafe({ weekKey, season, board }) };
};

export default function GameBoardPage({ weekKey, season, board }: Props) {
  const { t } = useTranslation('game');
  const url = `${siteBaseUrl()}${GAME_BRAND.basePath}/siralama`;
  return (
    <>
      <Head>
        <title>{t('boardTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={url} />
      </Head>
      <div className={styles.page}>
        <GameNav current="leaderboard" />
        <Leaderboard weekKey={weekKey} season={season} initial={board} initialScope={weekKey ? 'week' : 'season'} />
      </div>
    </>
  );
}
