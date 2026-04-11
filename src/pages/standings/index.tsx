import { useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/components/Container';
import { getLeagueTable, getTopScorers, getTopDisciplinary } from '@/services/liveScoreService';
import { getStandingRankZone } from '@/config/standingsZones';
import { standingsRankZoneClass } from '@/utils/standingsRankZoneUi';
import styles from './standings.module.scss';

// Default as Turkey Super Lig (id might need adjustment if different in Live Score API, using '6' for Super Lig)
const DEFAULT_COMPETITION_ID = '6';

export default function Standings() {
  const [activeTab, setActiveTab] = useState<'table' | 'scorers' | 'cards'>('table');
  const [table, setTable] = useState<any[]>([]);
  const [scorers, setScorers] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [tableData, scorersData, cardsData] = await Promise.all([
        getLeagueTable(DEFAULT_COMPETITION_ID),
        getTopScorers(DEFAULT_COMPETITION_ID),
        getTopDisciplinary(DEFAULT_COMPETITION_ID)
      ]);
      
      setTable(tableData || []);
      setScorers(scorersData?.topscorers ?? []);
      setCards(cardsData || []);
      setLoading(false);
    };
    
    fetchData();
  }, []);

  if (loading) {
    return <Container><div className={styles.loading}>Yükleniyor...</div></Container>;
  }

  return (
    <Container>
      <div className={styles.pageHeader}>
        <h1>Puan Durumu & İstatistikler</h1>
        {/* Can add a dropdown here later to select different leagues */}
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'table' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('table')}
        >
          Puan Durumu
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'scorers' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('scorers')}
        >
          Gol Krallığı
        </button>
        <button 
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
              {table.length > 0 ? table.map((row: any) => (
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
              )) : (
                <tr>
                  <td colSpan={10} className={styles.empty}>Veri bulunamadı.</td>
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
              {scorers.length > 0 ? scorers.map((s: any, i: number) => (
                <tr key={i}>
                  <td>{s.player?.name || s.name}</td>
                  <td>{s.team?.name || s.team_name}</td>
                  <td className={styles.statValue}>{s.goals}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className={styles.empty}>Veri bulunamadı.</td>
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
              {cards.length > 0 ? cards.map((c: any, i: number) => (
                <tr key={i}>
                  <td>{c.player?.name || c.name}</td>
                  <td>{c.team?.name || c.team_name}</td>
                  <td>{c.yellow_cards || 0}</td>
                  <td>{c.red_cards || 0}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className={styles.empty}>Veri bulunamadı.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Container>
  );
}
