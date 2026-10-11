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
import { gamePageGate } from '@/server/game/access';

type Props = { week: GameWeekView; board: LeaderboardView | null; prevKey: string | null; nextKey: string | null; noindex: boolean };

/** Tek hafta: maçlar, sonuçlar, kendi tahminlerim (istemcide) ve haftalık tablo. Taslak / olmayan hafta → 404. */
export const getServerSideProps: GetServerSideProps<Props> = async ({ params, req, res }) => {
  const gate = await gamePageGate(req, res);
  if (!gate) return { notFound: true };
  const key = params?.weekKey;
  if (!isWeekKey(key)) return { notFound: true };
  const week = await loadPublicWeek(key);
  if (!week) return { notFound: true };
  if (gate.publicCache) res.setHeader('Cache-Control', GAME_PAGE_CACHE);
  const [board, nav] = await Promise.all([loadLeaderboard('week', key), neighbourWeeks(key)]);
  return { props: propsJsonSafe({ week, board, ...nav, noindex: gate.noindex }) };
};

export default function GameWeekPage({ week, board, prevKey, nextKey, noindex }: Props) {
  const { t } = useTranslation('game');
  const url = `${siteBaseUrl()}${GAME_BRAND.basePath}/hafta/${week.weekKey}`;
  return (
    <>
      <Head>
        <title>{t('weekTitle', { week: weekNumber(week.weekKey) })}</title>
        {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
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
