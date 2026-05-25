/* eslint-disable @typescript-eslint/no-explicit-any -- Livescore tablo / skorer satırları gevşek şema */
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import { getStandingRankZone } from '@/config/standingsZones';
import { loadStandingsPageData } from '@/server/loadStandingsPageData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import { standingsRankZoneClass } from '@/utils/standingsRankZoneUi';
import styles from './standings.module.scss';

const DEFAULT_COMPETITION_ID = '6';

type StandingsPageProps = {
  payload: {
    table: unknown[];
    scorers: unknown[];
    cards: unknown[];
  } | null;
};

export default function Standings({
  payload,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation('standings');
  const [activeTab, setActiveTab] = useState<'table' | 'scorers' | 'cards'>('table');
  const table = (payload?.table ?? []) as any[];
  const scorers = (payload?.scorers ?? []) as any[];
  const cards = (payload?.cards ?? []) as any[];

  if (!payload) {
    return (
      <Container>
        <div className={styles.loading}>{t('loadError')}</div>
      </Container>
    );
  }

  return (
    <Container>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/standings`} />
        <link rel="canonical" href={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/standings`} />
      </Head>
      <div className={styles.pageHeader}>
        <h1>{t('heading')}</h1>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'table' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('table')}
        >
          {t('tabStandings')}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'scorers' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('scorers')}
        >
          {t('tabScorers')}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'cards' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('cards')}
        >
          {t('tabCards')}
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'table' && (
          <table className={styles.fullTable}>
            <thead>
              <tr>
                <th>{t('colRank')}</th>
                <th className={styles.teamCol}>{t('colTeam')}</th>
                <th>{t('colPlayed')}</th>
                <th>{t('colWon')}</th>
                <th>{t('colDrawn')}</th>
                <th>{t('colLost')}</th>
                <th>{t('colFor')}</th>
                <th>{t('colAgainst')}</th>
                <th>{t('colDiff')}</th>
                <th>{t('colPoints')}</th>
              </tr>
            </thead>
            <tbody>
              {table.length > 0 ? (
                table.map((row: any) => (
                  <tr key={row.team_id}>
                    <td
                      className={`${styles.rankCell} ${standingsRankZoneClass(
                        getStandingRankZone(
                          Number(row.rank),
                          table.length,
                          Number(DEFAULT_COMPETITION_ID)
                        )
                      ) ?? ''}`.trim()}
                    >
                      {row.rank}
                    </td>
                    <td className={styles.teamCol}>
                      <Link href={`/teams/${row.team_id}`} className={styles.teamLink}>
                        {row.name}
                      </Link>
                    </td>
                    <td>{row.matches}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goals_scored}</td>
                    <td>{row.goals_conceded}</td>
                    <td>{row.goal_diff}</td>
                    <td className={styles.points}>{row.points}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className={styles.empty}>
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'scorers' && (
          <table className={styles.statsTable}>
            <thead>
              <tr>
                <th>{t('colPlayer')}</th>
                <th>{t('colTeam')}</th>
                <th>{t('colGoals')}</th>
              </tr>
            </thead>
            <tbody>
              {scorers.length > 0 ? (
                scorers.map((s: any, i: number) => (
                  <tr key={i}>
                    <td>{s.player?.name || s.name}</td>
                    <td>{s.team?.name || s.team_name}</td>
                    <td className={styles.statValue}>{s.goals}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className={styles.empty}>
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'cards' && (
          <table className={styles.statsTable}>
            <thead>
              <tr>
                <th>{t('colPlayer')}</th>
                <th>{t('colTeam')}</th>
                <th>{t('colYellow')}</th>
                <th>{t('colRed')}</th>
              </tr>
            </thead>
            <tbody>
              {cards.length > 0 ? (
                cards.map((c: any, i: number) => (
                  <tr key={i}>
                    <td>{c.player?.name || c.name}</td>
                    <td>{c.team?.name || c.team_name}</td>
                    <td>{c.yellow_cards || 0}</td>
                    <td>{c.red_cards || 0}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Container>
  );
}

export const getServerSideProps: GetServerSideProps<StandingsPageProps> = async (ctx) => {
  try {
    ctx.res.setHeader(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=180'
    );
    const raw = await loadStandingsPageData(ctx.req, DEFAULT_COMPETITION_ID);
    const i18nProps = await serverSideTranslations(ctx.locale ?? 'tr', ['common', 'nav', 'standings', 'match']);
    return {
      props: {
        ...i18nProps,
        payload: raw == null ? null : propsJsonSafe(raw),
      },
    };
  } catch (e) {
    console.error('standings getServerSideProps', e);
    const i18nProps = await serverSideTranslations(ctx.locale ?? 'tr', ['common', 'nav', 'standings', 'match']);
    return { props: { ...i18nProps, payload: null } };
  }
};
