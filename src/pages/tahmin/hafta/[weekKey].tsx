import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import WeekPlay from '@/components/Game/WeekPlay';
import Leaderboard from '@/components/Game/Leaderboard';
import { weekNumber } from '@/components/Game/format';
import { GameNav } from '@/components/Game/Info';
import styles from '@/components/Game/game.module.scss';
import { GAME_BRAND } from '@/config/brand';
import type { GameWeekView, LeaderboardView } from '@/lib/game/types';
import { isWeekKey } from '@/lib/game/week';
import { siteBaseUrl } from '@/lib/siteUrl';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import { loadLeaderboard } from '@/server/game/play';
import { GAME_PAGE_CACHE, neighbourWeeks } from '@/server/game/pageData';
import { loadPublicWeek } from '@/server/game/weeks';

type Props = { week: GameWeekView; board: LeaderboardView | null; prevKey: string | null; nextKey: string | null };

/** Tek hafta: maçlar, sonuçlar, kendi tahminlerim (istemcide) ve haftalık tablo. Taslak / olmayan hafta → 404. */
export const getServerSideProps: GetServerSideProps<Props> = async ({ params, res }) => {
  const key = params?.weekKey;
  if (!isWeekKey(key)) return { notFound: true };
  const week = await loadPublicWeek(key);
  if (!week) return { notFound: true };
  res.setHeader('Cache-Control', GAME_PAGE_CACHE);
  const [board, nav] = await Promise.all([loadLeaderboard('week', key), neighbourWeeks(key)]);
  return { props: propsJsonSafe({ week, board, ...nav }) };
};

export default function GameWeekPage({ week, board, prevKey, nextKey }: Props) {
  const { t } = useTranslation('game');
  const url = `${siteBaseUrl()}${GAME_BRAND.basePath}/hafta/${week.weekKey}`;
  return (
    <>
      <Head>
        <title>{t('weekTitle', { week: weekNumber(week.weekKey) })}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={url} />
      </Head>
      <div className={styles.page}>
        <GameNav current="play" />
        <WeekPlay week={week} prevKey={prevKey} nextKey={nextKey} />
        <Leaderboard weekKey={week.weekKey} season={week.season} initial={board} initialScope="week" />
      </div>
    </>
  );
}
