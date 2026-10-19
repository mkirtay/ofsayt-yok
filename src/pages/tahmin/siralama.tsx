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
import { loadPublicDay, todayKey } from '@/server/game/days';
import { gamePageGate } from '@/server/game/access';

type Props = { weekKey: string | null; season: string; dayKey: string | null; board: LeaderboardView | null; noindex: boolean };

/** Sıralama: bu hafta / bugün (günlük oyun) / sezon (ilk 50). İlk sekme haftalık; hafta yoksa sezon. */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  const gate = await gamePageGate(req, res);
  if (!gate) return { notFound: true };
  if (gate.publicCache) res.setHeader('Cache-Control', GAME_PAGE_CACHE);
  const weekKey = await resolveCurrentWeekKey();
  const season = (weekKey && seasonOf(weekKey)) || seasonOf(weekKeyOf(Date.now()))!;
  const board = weekKey ? await loadLeaderboard('week', weekKey) : await loadLeaderboard('season', season);
  // Günlük sekme yalnız bugün oyun varsa (sekme seçilince tablo istemcide yüklenir).
  const today = todayKey();
  const dayKey = (await loadPublicDay(today)) ? today : null;
  return { props: propsJsonSafe({ weekKey, season, dayKey, board, noindex: gate.noindex }) };
};

export default function GameBoardPage({ weekKey, season, dayKey, board, noindex }: Props) {
  const { t } = useTranslation('game');
  const url = `${siteBaseUrl()}${GAME_BRAND.basePath}/siralama`;
  return (
    <>
      <Head>
        <title>{t('boardTitle')}</title>
        {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={url} />
      </Head>
      <div className={styles.page}>
        <GameNav current="leaderboard" />
        <Leaderboard
          weekKey={weekKey}
          season={season}
          dayKey={dayKey}
          scopes={[...(weekKey ? (['week'] as const) : []), ...(dayKey ? (['day'] as const) : []), 'season']}
          initial={board}
          initialScope={weekKey ? 'week' : 'season'}
        />
      </div>
    </>
  );
}
