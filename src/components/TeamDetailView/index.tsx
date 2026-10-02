/* eslint-disable @typescript-eslint/no-explicit-any -- Kadro / puan API gevşek şema */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import CompareTeamPicker from '@/components/CompareTeamPicker';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchCompetitionTopScorers from '@/components/MatchCompetitionTopScorers';
import { PanelSkeleton } from '@/components/Skeleton';
import { useTopScorersWithAppearances } from '@/hooks/useTopScorerAppearances';
import { useTeamOverview } from '@/hooks/useTeamOverview';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import { leagueNameById } from '@/utils/leagueName';
import hubStyles from '@/pages/index.module.scss';
import {
  getTeamCompetitions,
  getTeamSquads,
  getCompetitionTableFull,
  getSeasonsList,
  getTopScorers,
  type CompetitionTableData,
  type CompetitionTableStandingRow,
  type SeasonListItem,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import { competitionLogoNeedsBackdrop, uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';
import { toStandingsCompetitionId } from '@/services/sportmonksProviderFlag';
import { defaultCompetitionId, teamForm } from '@/services/sportmonks/teamOverview';
import { utcTimeToTr } from '@/utils/dateFormat';
import { buildMatchHref } from '@/utils/matchUrl';
import { groupSquadByPosition } from '@/utils/squadGroups';
import { detailedPositionLabel } from '@/utils/positionLabel';
import { useTeamSquadStats } from '@/hooks/useTeamSquadStats';
import LazyLoad from '@/components/LazyLoad';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { parseScore } from '@/utils/parseScore';
import { fixtureDateHeading } from '@/utils/fixtureDateLabel';
import {
  buildTeamFixtureGroups,
  fixtureKickoffLabel,
  nextFixtureWhen,
  nextTeamFixture,
  teamOpponent,
} from '@/utils/teamFixtures';
import styles from './teamDetailView.module.scss';
import TeamLogo from '@/components/TeamLogo';
import TeamHeader from './TeamHeader';
import RecentMatches from './RecentMatches';

// Kadro sekmesi yüklenirken (tıklamadan sonra): sahne ve CSS'i ayrı parçada. Kutu (yükseklik) burada.
const loadFormationLoading = () => import('@/components/PitchScenes/FormationLoading');


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

export function computeTeamStats(
  matches: Match[],
  teamId: string,
  table: CompetitionTableData | null
): TeamStats {
  const form: ('W' | 'D' | 'L')[] = [];
  let goalsScored = 0;
  let goalsConceded = 0;

  for (const m of matches) {
    if (String(m.status ?? '').toUpperCase() !== 'FINISHED') continue;
    const parsed = parseScore(m.scores?.score || m.scores?.ft_score);
    if (!parsed) continue;
    const [hg, ag] = parsed;

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

export function resolveMatchStatus(match: Match): string {
  const s = match.status?.toUpperCase();
  // Sportmonks eşlemesi tam durum adları döndürüyor ("FINISHED", "HALF TIME BREAK", "IN PLAY", "NOT STARTED"):
  // dar sütunda taşmasın diye kısa etikete çevrilir.
  if (s === 'FINISHED') return 'MS';
  if (s === 'HALF TIME BREAK') return 'İY';
  if (s === 'IN PLAY') return match.time ? `${String(match.time).replace(/'$/u, '')}'` : 'CANLI';
  if (s === 'NOT STARTED') return match.scheduled ? utcTimeToTr(match.scheduled, match.date) : match.time;
  if (s === 'FT' || s === 'AET' || s === 'PEN') return 'MS';
  if (s === 'HT') return 'İY';
  if (s === 'NS' || s === 'TBD' || s === '') {
    return match.scheduled ? utcTimeToTr(match.scheduled, match.date) : match.time;
  }
  return match.time || s || '';
}

/* ─── Component ─── */

type SidebarTab = 'standings' | 'leagues' | 'scorers';

export type TeamDetailViewProps = {
  teamId: string;
  /** `page`: /teams/[id] (viewport düzeni); `panel`: ana sayfa split-view paneli (container query, 520px eşik). */
  variant?: 'page' | 'panel';
};

export default function TeamDetailView({ teamId, variant = 'page' }: TeamDetailViewProps) {
  const overviewQuery = useTeamOverview(teamId, Boolean(teamId));
  // Veri yoksa ve hata da yoksa yükleniyor (statik HTML'de `teamId` henüz boşken de iskelet; "maç yok" görünmez).
  const overviewLoading = !overviewQuery.data && !overviewQuery.isError;
  const recentMatches = useMemo(() => overviewQuery.data?.recent ?? [], [overviewQuery.data]);
  const upcomingFixtures = useMemo(() => overviewQuery.data?.fixtures ?? [], [overviewQuery.data]);
  // Sidebar "Ligler": son 10 maç + fikstür (geçen sezonun kupası gibi bitmiş turnuvalar listeye girmez).
  const competitions = useMemo(
    () => getTeamCompetitions([...recentMatches.slice(0, 10), ...upcomingFixtures] as Match[], teamId),
    [recentMatches, upcomingFixtures, teamId],
  );
  const defaultCompId = useMemo(() => defaultCompetitionId(recentMatches, upcomingFixtures), [recentMatches, upcomingFixtures]);
  const { t } = useTranslation('team');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();

  const [activeTab, setActiveTab] = useState<'matches' | 'fixtures' | 'squad'>('matches');
  const [compareOpen, setCompareOpen] = useState(false);
  const [table, setTable] = useState<CompetitionTableData | null>(null);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('standings');
  // Kullanıcının seçtiği turnuva; seçmediyse varsayılan (son 10 maçta en çok oynanan). Takım değişince bileşen
  // yeniden kurulur (sayfa `key={teamId}`, panel `key={teamId}`) → ayrıca sıfırlama efekti yok.
  const [pickedCompetitionId, setSelectedCompetitionId] = useState('');
  const selectedCompetitionId = pickedCompetitionId || (defaultCompId != null ? String(defaultCompId) : '');
  const standingsCompetitionIdNum = selectedCompetitionId ? toStandingsCompetitionId(selectedCompetitionId) : null;
  const standingsCompetitionId = standingsCompetitionIdNum != null ? String(standingsCompetitionIdNum) : '';

  const handleSeasonChange = useCallback(async (seasonId: number, competitionIdStr: string) => {
    setSelectedSeasonId(seasonId);
    setStandingsLoading(true);
    const tbl = await getCompetitionTableFull(competitionIdStr, { season: seasonId });
    setTable(tbl);
    setStandingsLoading(false);
  }, []);

  const handleLeagueClick = useCallback((competitionId: number) => {
    setSelectedCompetitionId(String(competitionId));
    setSidebarTab('standings');
  }, []);

  // Turnuva seçilince yalnız puan durumu + sezon listesi. Kadro ve gol krallığı sekme açılınca (aşağıdaki sorgular).
  useEffect(() => {
    if (!teamId || !selectedCompetitionId) return;
    let cancelled = false;

    const loadCompetitionData = async () => {
      const standingsId = toStandingsCompetitionId(selectedCompetitionId);
      if (standingsId == null) {
        setSeasons([]);
        setSelectedSeasonId(null);
        setTable(null);
        setStandingsLoading(false);
        return;
      }
      setStandingsLoading(true);
      const standingsIdStr = String(standingsId);
      const [seasonsList, table1] = await Promise.all([
        getSeasonsList({ competitionId: standingsIdStr }),
        getCompetitionTableFull(standingsIdStr),
      ]);
      if (cancelled) return;
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
        tableFinal = await getCompetitionTableFull(standingsIdStr, { season: sid });
      }
      if (cancelled) return;
      setTable(tableFinal ?? table1);
      setStandingsLoading(false);
    };

    void loadCompetitionData();
    return () => {
      cancelled = true;
    };
  }, [teamId, selectedCompetitionId]);

  // Kadro: takım kapsamlı (Sportmonks'ta lig değil) → yalnız Kadro sekmesi açılınca.
  const squadQuery = useQuery({
    queryKey: ['team-squad', teamId] as const,
    queryFn: () => getTeamSquads(teamId, selectedCompetitionId),
    enabled: activeTab === 'squad' && Boolean(teamId),
    staleTime: 30 * 60_000,
  });
  const squad = squadQuery.data ?? [];
  const squadLoading = activeTab === 'squad' && (squadQuery.isLoading || (!squadQuery.data && squadQuery.isFetching));

  // Gol krallığı: yalnız sayfa varyantının kenar panelinde "Gol Krallığı" sekmesi açılınca.
  const topScorersQuery = useQuery({
    queryKey: ['team-page-topscorers', standingsCompetitionId, selectedSeasonId] as const,
    queryFn: () =>
      getTopScorers(standingsCompetitionId, selectedSeasonId != null ? { season: selectedSeasonId } : undefined),
    enabled: variant === 'page' && sidebarTab === 'scorers' && Boolean(standingsCompetitionId) && !standingsLoading,
    staleTime: 10 * 60_000,
  });
  const topScorers = topScorersQuery.data ?? null;
  const topScorersLoading = sidebarTab === 'scorers' && (standingsLoading || topScorersQuery.isLoading);

  /* ─── Memoized computed data ─── */

  const teamInfo = useMemo(() => {
    const team = overviewQuery.data?.team;
    if (team?.name) return { name: team.name, logo: team.logo };
    // Yedek: takım adı gelmezse ilk maçtaki taraf.
    const m = recentMatches[0] ?? upcomingFixtures[0];
    const side = m ? (String(m.home?.id) === teamId ? m.home : m.away) : undefined;
    return { name: side?.name || 'Takım Detayı', logo: side?.logo };
  }, [overviewQuery.data, recentMatches, upcomingFixtures, teamId]);

  const todayIso = todayIsoIstanbul();
  const fixtureGroups = useMemo(() => buildTeamFixtureGroups(upcomingFixtures, todayIso), [upcomingFixtures, todayIso]);
  const dayLabels = useMemo(
    () => ({ today: t('match:hub.fixtureToday'), tomorrow: t('match:hub.fixtureTomorrow') }),
    [t]
  );
  const nextFixture = nextTeamFixture(fixtureGroups);
  const nextOpponent = nextFixture ? teamOpponent(nextFixture, teamId)?.opponent : undefined;
  const headerForm = useMemo(() => teamForm(recentMatches, teamId, 5), [recentMatches, teamId]);

  const last10 = useMemo(() => recentMatches.slice(0, 10), [recentMatches]);
  const stats = useMemo(() => computeTeamStats(last10, teamId, table), [last10, teamId, table]);

  const topScorersWithAppearances = useTopScorersWithAppearances(topScorers, sidebarTab === 'scorers');
  const squadStats = useTeamSquadStats(teamId, selectedSeasonId, activeTab === 'squad');

  const selectedCompName = useMemo(() => {
    const comp = competitions.find((c) => String(c.id) === selectedCompetitionId);
    return comp ? leagueNameById(comp.id, comp.name, tl, 'full') : '';
  }, [competitions, selectedCompetitionId, tl]);

  const selectedCompShort = useMemo(() => {
    const comp = competitions.find((c) => String(c.id) === selectedCompetitionId);
    return comp ? leagueNameById(comp.id, comp.name, tl) : '';
  }, [competitions, selectedCompetitionId, tl]);
  const standingText =
    stats.standing && selectedCompShort
      ? t('header.standing', { competition: selectedCompShort, rank: stats.standing.rank, points: stats.standing.points })
      : null;

  const teamPageTitle = `${teamInfo.name} — Takım Detayı | Ofsayt Yok`;
  const teamPageDescription = `${teamInfo.name} takımının son maçları, kadro bilgileri ve lig istatistikleri.`;

  return (
    <div className={`${styles.root} ${variant === 'panel' ? styles.panelVariant : styles.pageVariant}`}>
      {variant === 'page' ? (
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
      ) : null}

      <TeamHeader
        loading={overviewLoading}
        name={teamInfo.name}
        logo={teamInfo.logo}
        standingText={standingText}
        standingLoading={standingsLoading || (Boolean(selectedCompetitionId) && !table && standingsCompetitionIdNum != null)}
        nextMatch={
          nextFixture && nextOpponent?.name
            ? { opponent: nextOpponent.name, when: nextFixtureWhen(nextFixture, todayIso, locale, dayLabels) }
            : null
        }
        form={headerForm}
        compareOpen={compareOpen}
        onToggleCompare={() => setCompareOpen((o) => !o)}
      />

      {/* ═══ Compare Panel ═══ */}
      {!overviewLoading && compareOpen && (
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
              {t('tabs.recent')}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'fixtures' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('fixtures')}
            >
              {t('tabs.fixtures')}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'squad' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('squad')}
            >
              {t('tabs.squad')}
            </button>
          </div>

          <div className={styles.tabContent}>
            {activeTab === 'matches' && (
              <RecentMatches
                key={teamId}
                matches={recentMatches}
                loading={overviewLoading}
                error={overviewQuery.isError}
              />
            )}
            {activeTab === 'fixtures' && (
              overviewLoading ? (
                <PanelSkeleton rows={6} />
              ) : overviewQuery.isError ? (
                <div className={styles.empty}>{t('fixtures.error')}</div>
              ) : fixtureGroups.length === 0 ? (
                <div className={styles.empty}>{t('fixtures.empty')}</div>
              ) : (
              <div className={styles.fixtureGroups}>
                {fixtureGroups.map((group) => (
                  <section key={group.date} className={styles.fixtureGroup}>
                    <div className={styles.fixtureDateBar} data-fixture-date={group.date}>
                      <span className={styles.fixtureDateLabel}>
                        {fixtureDateHeading(group.date, todayIso, locale, dayLabels)}
                      </span>
                      <span className={styles.fixtureDateCount}>
                        {t('match:list.matchCount', { count: group.matches.length })}
                      </span>
                    </div>
                    {group.matches.map((match) => {
                      const opponent = teamOpponent(match, teamId)?.opponent;
                      return (
                        <Link href={buildMatchHref(match)} key={match.id} className={styles.matchRow}>
                          <span className={styles.matchTime}>{fixtureKickoffLabel(match, t('fixtures.timeTbd'))}</span>
                          <span className={styles.fixtureOpponent}>
                            {opponent?.logo && (
                              <TeamLogo
                                src={opponent.logo}
                                alt=""
                                className={styles.matchTeamLogo}
                                width={18}
                                height={18}
                              />
                            )}
                            <span className={styles.matchTeamName}>{opponent?.name || ''}</span>
                          </span>
                          {match.competition?.name && (
                            <span className={styles.fixtureComp}>
                              {match.competition.logo && (
                                <TeamLogo
                                  src={match.competition.logo}
                                  alt=""
                                  className={`${styles.fixtureCompLogo} ${
                                    competitionLogoNeedsBackdrop(match.competition.id) ? styles.logoBackdrop : ''
                                  }`.trim()}
                                  width={14}
                                  height={14}
                                />
                              )}
                              <span className={styles.fixtureCompName}>
                                {leagueNameById(match.competition.id, match.competition.name, tl)}
                              </span>
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </section>
                ))}
              </div>
              )
            )}
            {activeTab === 'squad' && (
              squadLoading ? (
                <div className={styles.squadLoading}>
                  <LazyLoad load={loadFormationLoading} props={{ label: t('common:loading') }} />
                </div>
              ) : (
              <div className={styles.squadList}>
                {Array.isArray(squad) && squad.length > 0 ? (
                  groupSquadByPosition(squad as any[]).map((g) => (
                    <section key={g.key} className={styles.squadGroup}>
                      <h3 className={styles.squadGroupTitle}>
                        {g.label} ({g.players.length})
                      </h3>
                      <div className={`${styles.squadRow} ${styles.squadHead}`} aria-hidden="true">
                        <span className={styles.squadNameCol}>Oyuncu</span>
                        <span className={styles.squadPosCol}>Mevki</span>
                        <span className={styles.squadStat}>M</span>
                        <span className={styles.squadStat}>G</span>
                        <span className={styles.squadStat}>A</span>
                        <span className={`${styles.squadStat} ${styles.squadCardCol}`}>SK</span>
                        <span className={`${styles.squadStat} ${styles.squadCardCol}`}>KK</span>
                      </div>
                      <ul>
                        {g.players.map((p: any, i: number) => {
                          const st = squadStats[Number(p.id)];
                          const pos = detailedPositionLabel(st?.detailedPositionId);
                          const cell = (v: number | undefined) => (v == null ? '—' : v);
                          const row = (
                            <>
                              <span className={styles.squadNameCol}>
                                <span className={styles.squadNumber}>{p.shirt_number || '-'}</span>
                                {p.photo ? (
                                  <TeamLogo src={p.photo} alt="" className={styles.squadPhoto} width={28} height={28} />
                                ) : (
                                  <span className={`${styles.squadPhoto} ${styles.squadPhotoEmpty}`} aria-hidden="true" />
                                )}
                                <span className={styles.squadName}>{p.name}</span>
                              </span>
                              <span className={styles.squadPosCol}>{pos ?? '—'}</span>
                              <span className={styles.squadStat}>{cell(st?.appearances)}</span>
                              <span className={styles.squadStat}>{cell(st?.goals)}</span>
                              <span className={styles.squadStat}>{cell(st?.assists)}</span>
                              <span className={`${styles.squadStat} ${styles.squadCardCol}`}>{cell(st?.yellow)}</span>
                              <span className={`${styles.squadStat} ${styles.squadCardCol}`}>{cell(st?.red)}</span>
                            </>
                          );
                          return (
                            <li key={p.id || i}>
                              {p.id ? (
                                <Link href={`/players/${p.id}`} className={`${styles.squadPlayer} ${styles.squadRow}`} prefetch={false}>
                                  {row}
                                </Link>
                              ) : (
                                <div className={`${styles.squadPlayer} ${styles.squadRow}`}>{row}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))
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
          {/* Panelde (ana sayfa) global sidebar aynı Puan Durumu/Ligler/Gol Krallığı'nı zaten gösterir → yalnızca sayfa varyantında. */}
          {variant === 'page' && (
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
                  className={`${hubStyles.sidebarTab} ${sidebarTab === 'scorers' ? hubStyles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('scorers')}
                >
                  Gol Krallığı
                </button>
              </nav>

              <div className={hubStyles.sidebarContent}>
                {sidebarTab === 'standings' && (
                  <MatchCompetitionStandings
                    data={table}
                    loading={overviewLoading || standingsLoading}
                    competitionName={selectedCompName}
                    homeTeamId={Number.isFinite(Number(teamId)) ? Number(teamId) : undefined}
                    seasons={seasons}
                    selectedSeasonId={selectedSeasonId}
                    onSeasonChange={
                      standingsCompetitionId ? (sid) => void handleSeasonChange(sid, standingsCompetitionId) : undefined
                    }
                  />
                )}

                {sidebarTab === 'scorers' && (
                  <MatchCompetitionTopScorers
                    data={topScorersWithAppearances}
                    loading={overviewLoading || topScorersLoading}
                    seasons={seasons}
                    selectedSeasonId={selectedSeasonId}
                    onSeasonChange={
                      standingsCompetitionId ? (sid) => void handleSeasonChange(sid, standingsCompetitionId) : undefined
                    }
                  />
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
                                <TeamLogo
                                  src={logoUrl}
                                  alt=""
                                  className={hubStyles.leagueFlag}
                                  width={20}
                                  height={20}
                                />
                              ) : league.countryFlag ? (
                                <TeamLogo
                                  src={league.countryFlag}
                                  alt=""
                                  className={hubStyles.leagueFlag}
                                  width={20}
                                  height={14}
                                />
                              ) : null}
                              <span>{leagueNameById(league.id, league.name, tl)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className={styles.empty}>Bu takım için yarışma listesi bulunamadı.</div>
                  ))}

              </div>
            </div>
          )}

          {/* Stats Summary */}
          {overviewLoading || standingsLoading ? (
            <PanelSkeleton rows={4} />
          ) : (
          <div className={styles.statsCard}>
            <h3 className={styles.cardTitle}>{t('stats.title')}</h3>

            {/* Form */}
            {stats.form.length > 0 && (
              <div className={styles.statSection}>
                <span className={styles.statLabel}>{t('stats.formLast', { count: Math.min(stats.form.length, 10) })}</span>
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
                <span className={styles.statLabel}>{t('stats.goalsLast', { count: stats.matchCount })}</span>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{stats.goalsScored}</span>
                    <span className={styles.statCaption}>{t('stats.scored')}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{stats.goalsConceded}</span>
                    <span className={styles.statCaption}>{t('stats.conceded')}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>
                      {(stats.goalsScored / stats.matchCount).toFixed(1)}
                    </span>
                    <span className={styles.statCaption}>{t('stats.avgScored')}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>
                      {(stats.goalsConceded / stats.matchCount).toFixed(1)}
                    </span>
                    <span className={styles.statCaption}>{t('stats.avgConceded')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* League Summary */}
            {stats.standing && (
              <div className={styles.statSection}>
                <span className={styles.statLabel}>{t('stats.leagueSummary')}</span>
                {selectedCompName ? (
                  <span className={styles.statScope}>{t('stats.leagueOnly', { competition: selectedCompName })}</span>
                ) : null}
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
    </div>
  );
}
