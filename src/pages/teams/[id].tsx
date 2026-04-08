import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/components/Container';
import {
  getTeamLastMatches,
  getTeamSquads,
  getLeagueTable,
  getTeamCompetitions,
} from '@/services/liveScoreService';
import { Match } from '@/models/liveScore';
import { utcTimeToTr } from '@/utils/dateFormat';
import styles from './teamDetail.module.scss';

export default function TeamDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [activeTab, setActiveTab] = useState<'matches' | 'squad'>('matches');
  const [lastMatches, setLastMatches] = useState<Match[]>([]);
  const [squad, setSquad] = useState<any[]>([]);
  const [table, setTable] = useState<any>(null);
  const [competitions, setCompetitions] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      const teamIdStr = id as string;
      const matchesData = await getTeamLastMatches(teamIdStr);
      setLastMatches(matchesData);

      const comps = getTeamCompetitions(matchesData, teamIdStr);
      setCompetitions(comps);
      if (comps.length > 0) {
        setSelectedCompetitionId(String(comps[0].id));
      }

      setLoading(false);
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    if (!id || !selectedCompetitionId) return;

    const loadCompetitionData = async () => {
      const teamIdStr = id as string;
      const [squadData, tableData] = await Promise.all([
        getTeamSquads(teamIdStr, selectedCompetitionId),
        getLeagueTable(selectedCompetitionId),
      ]);

      setSquad(Array.isArray(squadData) ? squadData : []);
      setTable(tableData);
    };

    loadCompetitionData();
  }, [id, selectedCompetitionId]);

  if (loading) {
    return (
      <Container>
        <div className={styles.loading}>Yükleniyor...</div>
      </Container>
    );
  }

  let teamName = 'Takım Detayı';
  if (lastMatches.length > 0) {
    const m = lastMatches[0];
    teamName = m.home?.id?.toString() === id ? (m.home?.name || '') : (m.away?.name || '');
  }

  return (
    <Container>
      <div className={styles.teamHeader}>
        <div className={styles.logoPlaceholder}>{teamName.charAt(0) || '?'}</div>
        <h1 className={styles.teamName}>{teamName}</h1>
      </div>
      <div className={styles.competitionBar}>
        <label htmlFor="competition" className={styles.competitionLabel}>Lig</label>
        <select
          id="competition"
          className={styles.competitionSelect}
          value={selectedCompetitionId}
          onChange={(e) => setSelectedCompetitionId(e.target.value)}
        >
          {competitions.map((comp) => (
            <option key={comp.id} value={comp.id}>
              {comp.name}
            </option>
          ))}
        </select>
      </div>

      <div className="layout-split">
        <div className="layout-left">
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'matches' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('matches')}
            >
              Son Maçlar
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'squad' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('squad')}
            >
              Kadro
            </button>
          </div>

          <div className={styles.tabContent}>
            {activeTab === 'matches' && (
              <div className={styles.matchesList}>
                {lastMatches.map((match) => (
                  <Link href={`/matches/${match.id}`} key={match.id} className={styles.matchRow}>
                    <span className={styles.date}>{match.scheduled ? utcTimeToTr(match.scheduled, match.date) : match.time}</span>
                    <span className={styles.home}>{match.home?.name || ''}</span>
                    <span className={styles.score}>{match.scores?.score || ''}</span>
                    <span className={styles.away}>{match.away?.name || ''}</span>
                  </Link>
                ))}
                {lastMatches.length === 0 && (
                  <div className={styles.empty}>Son maç bulunamadı.</div>
                )}
              </div>
            )}
            {activeTab === 'squad' && (
              <div className={styles.squadList}>
                {Array.isArray(squad) && squad.length > 0 ? (
                  <ul>
                    {squad.map((p: any, i: number) => (
                      <li key={p.id || i} className={styles.squadPlayer}>
                        <span className={styles.squadNumber}>{p.shirt_number || '-'}</span>
                        {p.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.empty}>Kadro bilgisi bulunamadı.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="layout-right">
          <div className={styles.tableContainer}>
            <h3 className={styles.tableTitle}>Puan Durumu</h3>
            {table && Array.isArray(table) ? (
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th>S</th>
                    <th>Takım</th>
                    <th>O</th>
                    <th>P</th>
                  </tr>
                </thead>
                <tbody>
                  {table.slice(0, 10).map((row: any) => (
                    <tr
                      key={row.team_id}
                      className={row.team_id?.toString() === id ? styles.highlightRow : ''}
                    >
                      <td>{row.rank}</td>
                      <td>
                        <Link href={`/teams/${row.team_id}`} className={styles.tableTeamLink}>
                          {row.name}
                        </Link>
                      </td>
                      <td>{row.matches}</td>
                      <td className={styles.points}>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.empty}>Puan durumu bulunamadı.</div>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
