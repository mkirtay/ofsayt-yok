/* eslint-disable @typescript-eslint/no-explicit-any -- Kadro / puan API gevşek şema */
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Container from '@/components/Container';
import {
  getTeamLastMatches,
  getTeamSquads,
  getLeagueTable,
  getTeamCompetitions,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import type { TeamDetailPageServerPayload } from '@/server/loadTeamDetailInitialData';
import { loadTeamDetailInitialData } from '@/server/loadTeamDetailInitialData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import { utcTimeToTr } from '@/utils/dateFormat';
import styles from './teamDetail.module.scss';

type TeamDetailPageProps = {
  teamId: string;
  initialTeamData: TeamDetailPageServerPayload;
};

export default function TeamDetail({
  teamId,
  initialTeamData,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [activeTab, setActiveTab] = useState<'matches' | 'squad'>('matches');
  const [lastMatches, setLastMatches] = useState<Match[]>(() => initialTeamData.lastMatches);
  const [squad, setSquad] = useState<unknown[]>(() => initialTeamData.squad);
  const [table, setTable] = useState<unknown>(() => initialTeamData.table);
  const [competitions, setCompetitions] = useState<Array<{ id: number; name: string }>>(
    () => initialTeamData.competitions
  );
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>(
    () => initialTeamData.selectedCompetitionId
  );
  const [loading, setLoading] = useState(false);

  const skipInitialMatchesFetch = useRef(!!initialTeamData);
  const skipInitialCompFetch = useRef(!!initialTeamData);

  useEffect(() => {
    if (!teamId) return;

    if (skipInitialMatchesFetch.current) {
      skipInitialMatchesFetch.current = false;
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const matchesData = await getTeamLastMatches(teamId);
      setLastMatches(matchesData);

      const comps = getTeamCompetitions(matchesData, teamId);
      setCompetitions(comps);
      if (comps.length > 0) {
        setSelectedCompetitionId(String(comps[0]!.id));
      }

      setLoading(false);
    };

    void fetchData();
  }, [teamId]);

  useEffect(() => {
    if (!teamId || !selectedCompetitionId) return;

    if (skipInitialCompFetch.current) {
      skipInitialCompFetch.current = false;
      return;
    }

    const loadCompetitionData = async () => {
      const [squadData, tableData] = await Promise.all([
        getTeamSquads(teamId, selectedCompetitionId),
        getLeagueTable(selectedCompetitionId),
      ]);

      setSquad(Array.isArray(squadData) ? squadData : []);
      setTable(tableData);
    };

    void loadCompetitionData();
  }, [teamId, selectedCompetitionId]);

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
    teamName =
      m.home?.id?.toString() === teamId ? (m.home?.name || '') : (m.away?.name || '');
  }

  return (
    <Container>
      <div className={styles.teamHeader}>
        <div className={styles.logoPlaceholder}>{teamName.charAt(0) || '?'}</div>
        <h1 className={styles.teamName}>{teamName}</h1>
      </div>
      <div className={styles.competitionBar}>
        <label htmlFor="competition" className={styles.competitionLabel}>
          Lig
        </label>
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
              type="button"
              className={`${styles.tab} ${activeTab === 'matches' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('matches')}
            >
              Son Maçlar
            </button>
            <button
              type="button"
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
                    <span className={styles.date}>
                      {match.scheduled ? utcTimeToTr(match.scheduled, match.date) : match.time}
                    </span>
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
                      className={row.team_id?.toString() === teamId ? styles.highlightRow : ''}
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

export const getServerSideProps: GetServerSideProps<TeamDetailPageProps> = async (ctx) => {
  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=180'
  );
  const rawId = ctx.params?.id;
  const teamId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
  if (!teamId) return { notFound: true };

  const raw =
    (await loadTeamDetailInitialData(ctx.req, teamId)) ?? {
      lastMatches: [],
      competitions: [],
      selectedCompetitionId: '',
      squad: [],
      table: null,
    };

  return {
    props: {
      teamId,
      initialTeamData: propsJsonSafe(raw),
    },
  };
};
