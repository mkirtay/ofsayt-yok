/* eslint-disable @typescript-eslint/no-explicit-any -- Kadro / puan API gevşek şema */
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useEffect, useMemo, useRef, useState } from 'react';
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

/* ─── Helpers ─── */

type StandingRow = {
  rank: number;
  team_id: number;
  name: string;
  matches: number;
  won: number;
  drawn: number;
  lost: number;
  goals_scored: number;
  goals_conceded: number;
  goal_diff: number;
  points: number;
  logo?: string;
};

type TeamStats = {
  form: ('W' | 'D' | 'L')[];
  goalsScored: number;
  goalsConceded: number;
  matchCount: number;
  standing: StandingRow | null;
};

function computeTeamStats(
  matches: Match[],
  teamId: string,
  table: unknown
): TeamStats {
  const form: ('W' | 'D' | 'L')[] = [];
  let goalsScored = 0;
  let goalsConceded = 0;

  for (const m of matches) {
    const ft = m.scores?.ft_score || m.scores?.score;
    if (!ft) continue;
    const [hg, ag] = ft.split(' - ').map(Number);
    if (isNaN(hg) || isNaN(ag)) continue;

    const isHome = m.home?.id?.toString() === teamId;
    const teamGoals = isHome ? hg : ag;
    const oppGoals = isHome ? ag : hg;
    goalsScored += teamGoals;
    goalsConceded += oppGoals;

    if (teamGoals > oppGoals) form.push('W');
    else if (teamGoals === oppGoals) form.push('D');
    else form.push('L');
  }

  let standing: StandingRow | null = null;
  if (Array.isArray(table)) {
    standing =
      table.find((r: any) => r.team_id?.toString() === teamId) ?? null;
  }

  return { form, goalsScored, goalsConceded, matchCount: form.length, standing };
}

function formLabel(f: 'W' | 'D' | 'L'): string {
  if (f === 'W') return 'G';
  if (f === 'D') return 'B';
  return 'M';
}

function formVariant(f: 'W' | 'D' | 'L'): string {
  if (f === 'W') return styles.formWin;
  if (f === 'D') return styles.formDraw;
  return styles.formLoss;
}

function resolveMatchStatus(match: Match): string {
  const s = match.status?.toUpperCase();
  if (s === 'FT' || s === 'AET' || s === 'PEN') return 'MS';
  if (s === 'HT') return 'İY';
  if (s === 'NS' || s === 'TBD' || s === '') {
    return match.scheduled ? utcTimeToTr(match.scheduled, match.date) : match.time;
  }
  return match.time || s || '';
}

/* ─── Component ─── */

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

  /* ─── Memoized computed data ─── */

  const teamInfo = useMemo(() => {
    if (lastMatches.length === 0) return { name: 'Takım Detayı', logo: undefined as string | undefined };
    const m = lastMatches[0];
    const isHome = m.home?.id?.toString() === teamId;
    const team = isHome ? m.home : m.away;
    return { name: team?.name || 'Takım Detayı', logo: team?.logo };
  }, [lastMatches, teamId]);

  const stats = useMemo(
    () => computeTeamStats(lastMatches, teamId, table),
    [lastMatches, teamId, table]
  );

  const selectedCompName = useMemo(
    () => competitions.find((c) => String(c.id) === selectedCompetitionId)?.name || '',
    [competitions, selectedCompetitionId]
  );

  if (loading) {
    return (
      <Container>
        <div className={styles.loading}>Yükleniyor...</div>
      </Container>
    );
  }

  return (
    <Container>
      {/* ═══ Team Header ═══ */}
      <div className={styles.teamHeader}>
        {teamInfo.logo ? (
          <img
            src={teamInfo.logo}
            alt={teamInfo.name}
            className={styles.teamLogo}
            width={56}
            height={56}
          />
        ) : (
          <div className={styles.logoPlaceholder}>{teamInfo.name.charAt(0) || '?'}</div>
        )}
        <div className={styles.teamHeaderInfo}>
          <h1 className={styles.teamName}>{teamInfo.name}</h1>
          {stats.standing && (
            <span className={styles.teamMeta}>
              {selectedCompName} · {stats.standing.rank}. sıra · {stats.standing.points} puan
            </span>
          )}
        </div>
      </div>

      {/* ═══ Competition Bar ═══ */}
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

      {/* ═══ Main Layout ═══ */}
      <div className={styles.layoutSplit}>
        {/* — Left Column — */}
        <div className={styles.layoutLeft}>
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
                {lastMatches.map((match) => {
                  const statusLabel = resolveMatchStatus(match);
                  return (
                    <Link href={`/matches/${match.id}`} key={match.id} className={styles.matchRow}>
                      <span className={styles.matchTime}>{statusLabel}</span>

                      <div className={styles.matchTeams}>
                        <span className={styles.matchTeam}>
                          {match.home?.logo && (
                            <img
                              src={match.home.logo}
                              alt=""
                              className={styles.matchTeamLogo}
                              width={18}
                              height={18}
                              loading="lazy"
                              decoding="async"
                            />
                          )}
                          <span className={styles.matchTeamName}>{match.home?.name || ''}</span>
                        </span>

                        <span className={styles.matchScore}>
                          {match.scores?.ft_score || match.scores?.score || '-'}
                        </span>

                        <span className={styles.matchTeam}>
                          {match.away?.logo && (
                            <img
                              src={match.away.logo}
                              alt=""
                              className={styles.matchTeamLogo}
                              width={18}
                              height={18}
                              loading="lazy"
                              decoding="async"
                            />
                          )}
                          <span className={styles.matchTeamName}>{match.away?.name || ''}</span>
                        </span>
                      </div>

                      {match.competition_name && (
                        <span className={styles.matchCompLabel}>{match.competition_name}</span>
                      )}
                    </Link>
                  );
                })}
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

        {/* — Right Column — */}
        <div className={styles.layoutRight}>
          {/* Stats Summary */}
          <div className={styles.statsCard}>
            <h3 className={styles.cardTitle}>İstatistikler</h3>

            {/* Form */}
            {stats.form.length > 0 && (
              <div className={styles.statSection}>
                <span className={styles.statLabel}>Form (Son {Math.min(stats.form.length, 10)})</span>
                <div className={styles.formRow}>
                  {stats.form.slice(0, 10).map((f, i) => (
                    <span key={i} className={`${styles.formPill} ${formVariant(f)}`}>
                      {formLabel(f)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Goal Summary */}
            {stats.matchCount > 0 && (
              <div className={styles.statSection}>
                <span className={styles.statLabel}>Gol Özeti</span>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{stats.goalsScored}</span>
                    <span className={styles.statCaption}>Attığı</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{stats.goalsConceded}</span>
                    <span className={styles.statCaption}>Yediği</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>
                      {(stats.goalsScored / stats.matchCount).toFixed(1)}
                    </span>
                    <span className={styles.statCaption}>Ort. Atılan</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>
                      {(stats.goalsConceded / stats.matchCount).toFixed(1)}
                    </span>
                    <span className={styles.statCaption}>Ort. Yenilen</span>
                  </div>
                </div>
              </div>
            )}

            {/* League Summary */}
            {stats.standing && (
              <div className={styles.statSection}>
                <span className={styles.statLabel}>Lig Özeti</span>
                <table className={styles.leagueSummaryTable}>
                  <thead>
                    <tr>
                      <th>S</th>
                      <th>O</th>
                      <th>G</th>
                      <th>B</th>
                      <th>M</th>
                      <th>AV</th>
                      <th>P</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{stats.standing.rank}</td>
                      <td>{stats.standing.matches}</td>
                      <td>{stats.standing.won}</td>
                      <td>{stats.standing.drawn}</td>
                      <td>{stats.standing.lost}</td>
                      <td>{stats.standing.goal_diff}</td>
                      <td className={styles.points}>{stats.standing.points}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Standings */}
          <div className={styles.tableContainer}>
            <h3 className={styles.cardTitle}>Puan Durumu</h3>
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
                        <Link href={`/teams/${row.team_id}`} className={styles.tableTeamCell}>
                          {(row.logo || row.team?.logo) && (
                            <img
                              src={row.logo || row.team?.logo}
                              alt=""
                              className={styles.tableTeamLogo}
                              width={16}
                              height={16}
                              loading="lazy"
                              decoding="async"
                            />
                          )}
                          <span>{row.name}</span>
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
