/* eslint-disable @typescript-eslint/no-explicit-any -- Kadro / puan API gevşek şema */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Container from '@/components/Container';
import CompareTeamPicker from '@/components/CompareTeamPicker';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchCompetitionTopScorers from '@/components/MatchCompetitionTopScorers';
import NewsList from '@/components/NewsList';
import {
  LineupSkeleton,
  PanelSkeleton,
  TeamHeaderSkeleton,
} from '@/components/Skeleton';
import { useTeamDetailBootstrap } from '@/hooks/useTeamDetailBootstrap';
import hubStyles from '@/pages/index.module.scss';
import {
  getTeamSquads,
  getCompetitionTableFull,
  getSeasonsList,
  getTopScorers,
  type CompetitionTableData,
  type CompetitionTableStandingRow,
  type SeasonListItem,
  type TopScorersPayload,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import type { NewsItem } from '@/models/domain';
import { getNews } from '@/services/newsApi';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';
import { utcTimeToTr } from '@/utils/dateFormat';
import { buildMatchHref } from '@/utils/matchUrl';
import styles from './teamDetail.module.scss';

/* ─── Helpers ─── */

type TeamStats = {
  form: ('W' | 'D' | 'L')[];
  goalsScored: number;
  goalsConceded: number;
  matchCount: number;
  standing: CompetitionTableStandingRow | null;
};

function rowTeamId(row: CompetitionTableStandingRow): string | undefined {
  const id = row.team?.id ?? row.team_id;
  return id != null ? String(id) : undefined;
}

function findStandingForTeam(
  table: CompetitionTableData | null,
  teamId: string
): CompetitionTableStandingRow | null {
  if (!table) return null;
  if (Array.isArray(table.table)) {
    const hit = table.table.find((r) => rowTeamId(r) === teamId);
    if (hit) return hit;
  }
  if (Array.isArray(table.stages)) {
    for (const stage of table.stages) {
      for (const group of stage.groups ?? []) {
        const hit = group.standings?.find((r) => rowTeamId(r) === teamId);
        if (hit) return hit;
      }
    }
  }
  return null;
}

function computeTeamStats(
  matches: Match[],
  teamId: string,
  table: CompetitionTableData | null
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

  return {
    form,
    goalsScored,
    goalsConceded,
    matchCount: form.length,
    standing: findStandingForTeam(table, teamId),
  };
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

type SidebarTab = 'standings' | 'leagues' | 'news';

export default function TeamDetail() {
  const router = useRouter();
  const idParam = router.query.id;
  const idFromPath = router.asPath.match(/^\/teams\/([^/?#]+)/)?.[1] ?? '';
  const teamId =
    typeof idParam === 'string'
      ? idParam
      : Array.isArray(idParam)
        ? idParam[0] ?? idFromPath
        : idFromPath;

  const bootstrapQuery = useTeamDetailBootstrap(teamId, router.isReady || Boolean(idFromPath));
  const lastMatches = bootstrapQuery.data?.lastMatches ?? [];
  const competitions = bootstrapQuery.data?.competitions ?? [];
  const bootstrapLoading = bootstrapQuery.isLoading;

  const [activeTab, setActiveTab] = useState<'matches' | 'squad'>('matches');
  const [compareOpen, setCompareOpen] = useState(false);
  const [squad, setSquad] = useState<unknown[]>([]);
  const [table, setTable] = useState<CompetitionTableData | null>(null);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [topScorers, setTopScorers] = useState<TopScorersPayload | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [topScorersLoading, setTopScorersLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('standings');
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState('');
  const [squadLoading, setSquadLoading] = useState(false);

  useEffect(() => {
    setSelectedCompetitionId('');
    setSquad([]);
    setTable(null);
    setSeasons([]);
    setSelectedSeasonId(null);
    setTopScorers(null);
  }, [teamId]);

  useEffect(() => {
    const sid = bootstrapQuery.data?.selectedCompetitionId;
    if (sid) setSelectedCompetitionId(sid);
  }, [bootstrapQuery.data?.selectedCompetitionId, teamId]);

  const handleSeasonChange = useCallback(async (seasonId: number, competitionIdStr: string) => {
    setSelectedSeasonId(seasonId);
    setStandingsLoading(true);
    setTopScorersLoading(true);
    const [tbl, scorers] = await Promise.all([
      getCompetitionTableFull(competitionIdStr, { season: seasonId }),
      getTopScorers(competitionIdStr, { season: seasonId }),
    ]);
    setTable(tbl);
    setTopScorers(scorers);
    setStandingsLoading(false);
    setTopScorersLoading(false);
  }, []);

  const handleLeagueClick = useCallback((competitionId: number) => {
    setSelectedCompetitionId(String(competitionId));
    setSidebarTab('standings');
  }, []);

  useEffect(() => {
    if (!teamId || !selectedCompetitionId) return;

    const loadCompetitionData = async () => {
      setStandingsLoading(true);
      setTopScorersLoading(true);
      setSquadLoading(true);
      const [squadData, seasonsList, table1] = await Promise.all([
        getTeamSquads(teamId, selectedCompetitionId),
        getSeasonsList(),
        getCompetitionTableFull(selectedCompetitionId),
      ]);

      setSquad(Array.isArray(squadData) ? squadData : []);
      setSquadLoading(false);
      setSeasons(seasonsList);

      const fromTable =
        table1?.season?.id != null && Number.isFinite(Number(table1.season.id))
          ? Number(table1.season.id)
          : null;
      let sid: number | null = fromTable;
      if (sid != null && seasonsList.length && !seasonsList.some((s) => s.id === sid)) {
        sid = seasonsList[0]!.id;
      } else if (sid == null && seasonsList.length) {
        sid = seasonsList[0]!.id;
      }
      setSelectedSeasonId(sid);

      const needTableRefetch =
        sid != null &&
        table1 != null &&
        (table1.season?.id == null || Number(table1.season.id) !== sid);

      let tableFinal = table1;
      if (needTableRefetch && sid != null) {
        tableFinal = await getCompetitionTableFull(selectedCompetitionId, { season: sid });
      }
      setTable(tableFinal ?? table1);

      const scorersData = await getTopScorers(
        selectedCompetitionId,
        sid != null ? { season: sid } : undefined
      );
      setTopScorers(scorersData);
      setStandingsLoading(false);
      setTopScorersLoading(false);
    };

    void loadCompetitionData();
  }, [teamId, selectedCompetitionId]);

  useEffect(() => {
    if (sidebarTab !== 'news' || newsItems.length > 0) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setNewsLoading(true);
    });
    getNews(15).then((items) => {
      if (!cancelled) {
        setNewsItems(items);
        setNewsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sidebarTab, newsItems.length]);

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

  const teamPageTitle = `${teamInfo.name} — Takım Detayı | Ofsayt Yok`;
  const teamPageDescription = `${teamInfo.name} takımının son maçları, kadro bilgileri ve lig istatistikleri.`;

  return (
    <Container>
      <Head>
        <title>{teamPageTitle}</title>
        <meta name="description" content={teamPageDescription} />
        <meta property="og:title" content={teamPageTitle} />
        <meta property="og:description" content={teamPageDescription} />
        {teamInfo.logo && (
          <>
            <meta property="og:image" content={teamInfo.logo} key="og:image" />
            <meta name="twitter:image" content={teamInfo.logo} />
          </>
        )}
      </Head>

      {bootstrapLoading ? (
        <TeamHeaderSkeleton />
      ) : (
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
        <button
          type="button"
          className={`${styles.compareToggleBtn} ${compareOpen ? styles.compareToggleBtnOpen : ''}`}
          onClick={() => setCompareOpen((o) => !o)}
        >
          ⇄ Karşılaştır
        </button>
      </div>
      )}

      {/* ═══ Compare Panel ═══ */}
      {!bootstrapLoading && compareOpen && (
        <div className={styles.comparePanel}>
          <CompareTeamPicker
            fixedTeamId={Number(teamId)}
            fixedTeamName={teamInfo.name}
          />
        </div>
      )}

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
              bootstrapLoading ? (
                <PanelSkeleton rows={6} />
              ) : (
              <div className={styles.matchesList}>
                {lastMatches.map((match) => {
                  const statusLabel = resolveMatchStatus(match);
                  return (
                    <Link href={buildMatchHref(match)} key={match.id} className={styles.matchRow}>
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
              )
            )}
            {activeTab === 'squad' && (
              squadLoading ? (
                <LineupSkeleton />
              ) : (
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
              )
            )}
          </div>
        </div>

        {/* — Right Column — */}
        <div className={styles.layoutRight}>
          <div className={hubStyles.sidebar}>
            <nav className={hubStyles.sidebarTabs}>
              <button
                type="button"
                className={`${hubStyles.sidebarTab} ${sidebarTab === 'standings' ? hubStyles.sidebarTabActive : ''}`}
                onClick={() => setSidebarTab('standings')}
              >
                Puan Durumu
              </button>
              <button
                type="button"
                className={`${hubStyles.sidebarTab} ${sidebarTab === 'leagues' ? hubStyles.sidebarTabActive : ''}`}
                onClick={() => setSidebarTab('leagues')}
              >
                Ligler
              </button>
              <button
                type="button"
                className={`${hubStyles.sidebarTab} ${sidebarTab === 'news' ? hubStyles.sidebarTabActive : ''}`}
                onClick={() => setSidebarTab('news')}
              >
                Haberler
              </button>
            </nav>

            <div className={hubStyles.sidebarContent}>
              {sidebarTab === 'standings' && (
                <>
                  <MatchCompetitionStandings
                    data={table}
                    loading={bootstrapLoading || standingsLoading}
                    competitionName={selectedCompName}
                    homeTeamId={
                      Number.isFinite(Number(teamId)) ? Number(teamId) : undefined
                    }
                    seasons={seasons}
                    selectedSeasonId={selectedSeasonId}
                    onSeasonChange={
                      selectedCompetitionId
                        ? (sid) => void handleSeasonChange(sid, selectedCompetitionId)
                        : undefined
                    }
                  />
                  <MatchCompetitionTopScorers
                    data={topScorers}
                    loading={bootstrapLoading || topScorersLoading}
                    seasons={seasons}
                    selectedSeasonId={selectedSeasonId}
                    onSeasonChange={
                      selectedCompetitionId
                        ? (sid) => void handleSeasonChange(sid, selectedCompetitionId)
                        : undefined
                    }
                  />
                </>
              )}

              {sidebarTab === 'leagues' &&
                (competitions.length > 0 ? (
                  <ul className={hubStyles.leagueList}>
                    {competitions.map((league) => {
                      const logoUrl =
                        league.logo || uefaCompetitionLogoSrcById(league.id);
                      return (
                        <li key={league.id}>
                          <button
                            type="button"
                            className={`${hubStyles.leagueItem} ${String(league.id) === selectedCompetitionId ? hubStyles.leagueItemActive : ''}`}
                            onClick={() => handleLeagueClick(league.id)}
                          >
                            {logoUrl ? (
                              <img
                                src={logoUrl}
                                alt=""
                                className={hubStyles.leagueFlag}
                                width={20}
                                height={20}
                              />
                            ) : league.countryId != null ? (
                              <img
                                src={countryFlagImgSrc(league.countryId)}
                                alt=""
                                className={hubStyles.leagueFlag}
                                width={20}
                                height={14}
                              />
                            ) : null}
                            <span>{league.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className={styles.empty}>Bu takım için yarışma listesi bulunamadı.</div>
                ))}

              {sidebarTab === 'news' && (
                <NewsList items={newsItems} loading={newsLoading} />
              )}
            </div>
          </div>

          {/* Stats Summary */}
          {bootstrapLoading || standingsLoading ? (
            <PanelSkeleton rows={4} />
          ) : (
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
          )}
        </div>
      </div>
    </Container>
  );
}
