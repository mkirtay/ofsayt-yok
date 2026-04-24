/* eslint-disable @typescript-eslint/no-explicit-any -- Livescore tablo / skorer satırları gevşek şema */
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useState } from 'react';
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
  const [activeTab, setActiveTab] = useState<'table' | 'scorers' | 'cards'>('table');
  const table = (payload?.table ?? []) as any[];
  const scorers = (payload?.scorers ?? []) as any[];
  const cards = (payload?.cards ?? []) as any[];

  if (!payload) {
    return (
      <Container>
        <div className={styles.loading}>Veri yüklenemedi.</div>
      </Container>
    );
  }

  return (
    <Container>
      <div className={styles.pageHeader}>
        <h1>Puan Durumu & İstatistikler</h1>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'table' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('table')}
        >
          Puan Durumu
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'scorers' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('scorers')}
        >
          Gol Krallığı
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'cards' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('cards')}
        >
          Kartlar
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'table' && (
          <table className={styles.fullTable}>
            <thead>
              <tr>
                <th>S</th>
                <th className={styles.teamCol}>Takım</th>
                <th>O</th>
                <th>G</th>
                <th>B</th>
                <th>M</th>
                <th>A</th>
                <th>Y</th>
                <th>Av</th>
                <th>P</th>
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
                    Veri bulunamadı.
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
                <th>Oyuncu</th>
                <th>Takım</th>
                <th>Gol</th>
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
                    Veri bulunamadı.
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
                <th>Oyuncu</th>
                <th>Takım</th>
                <th>Sarı</th>
                <th>Kırmızı</th>
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
                    Veri bulunamadı.
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
  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=180'
  );
  const raw = await loadStandingsPageData(ctx.req, DEFAULT_COMPETITION_ID);
  return {
    props: {
      payload: raw == null ? null : propsJsonSafe(raw),
    },
  };
};
