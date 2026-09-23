/* eslint-disable @typescript-eslint/no-explicit-any -- Kadro / puan API gevşek şema */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import CompareTeamPicker from '@/components/CompareTeamPicker';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchCompetitionTopScorers from '@/components/MatchCompetitionTopScorers';
import {
  LineupSkeleton,
  PanelSkeleton,
  TeamHeaderSkeleton,
} from '@/components/Skeleton';
import { useTopScorersWithAppearances } from '@/hooks/useTopScorerAppearances';
import { useTeamDetailBootstrap } from '@/hooks/useTeamDetailBootstrap';
import { useTeamUpcomingFixtures } from '@/hooks/useTeamUpcomingFixtures';
import { useI18n, useTranslation } from '@/lib/i18n';
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
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';
import { toStandingsCompetitionId } from '@/services/sportmonksProviderFlag';
import { utcTimeToTr } from '@/utils/dateFormat';
import { buildMatchHref } from '@/utils/matchUrl';
import { groupSquadByPosition } from '@/utils/squadGroups';
import { detailedPositionLabel } from '@/utils/positionLabel';
import { useTeamSquadStats } from '@/hooks/useTeamSquadStats';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { fixtureDateHeading } from '@/utils/fixtureDateLabel';
import {
  buildTeamFixtureGroups,
  fixtureKickoffLabel,
  nextFixtureWhen,
  nextTeamFixture,
  teamOpponent,
} from '@/utils/teamFixtures';
import styles from './teamDetailView.module.scss';

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
  const bootstrapQuery = useTeamDetailBootstrap(teamId, Boolean(teamId));
  const lastMatches = bootstrapQuery.data?.lastMatches ?? [];
  const competitions = bootstrapQuery.data?.competitions ?? [];
  const bootstrapLoading = bootstrapQuery.isLoading;
  const upcomingQuery = useTeamUpcomingFixtures(teamId, Boolean(teamId));
  const { t } = useTranslation('team');
  const { locale } = useI18n();

  const [activeTab, setActiveTab] = useState<'matches' | 'fixtures' | 'squad'>('matches');
  const [compareOpen, setCompareOpen] = useState(false);
  const [squad, setSquad] = useState<unknown[]>([]);
  const [table, setTable] = useState<CompetitionTableData | null>(null);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [topScorers, setTopScorers] = useState<TopScorersPayload | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [topScorersLoading, setTopScorersLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('standings');
  const [selectedCompetitionId, setSelectedCompetitionId] = useState('');
  const [squadLoading, setSquadLoading] = useState(false);
  const standingsCompetitionIdNum = selectedCompetitionId ? toStandingsCompetitionId(selectedCompetitionId) : null;
  const standingsCompetitionId = standingsCompetitionIdNum != null ? String(standingsCompetitionIdNum) : '';

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
      // `selectedCompetitionId` takımın maçlarından gelir → Sportmonks açıkken Sportmonks league_id (Süper Lig = 600).
      // Puan durumu/sezon/gol krallığı fonksiyonları legacy id bekler; çevrilmeden geçilirse (600 → eşleme yok)
      // "bulunamadı" çıkar. Eşlemesi olmayan lig için tablo yok (yanlış lig yerine).
      const standingsId = toStandingsCompetitionId(selectedCompetitionId);
      if (standingsId == null) {
        const squadOnly = await getTeamSquads(teamId, selectedCompetitionId);
        setSquad(Array.isArray(squadOnly) ? squadOnly : []);
        setSquadLoading(false);
        setSeasons([]);
        setSelectedSeasonId(null);
        setTable(null);
        setTopScorers(null);
        setStandingsLoading(false);
        setTopScorersLoading(false);
        return;
      }
      const standingsIdStr = String(standingsId);
      const [squadData, seasonsList, table1] = await Promise.all([
        getTeamSquads(teamId, selectedCompetitionId),
        getSeasonsList({ competitionId: standingsIdStr }),
        getCompetitionTableFull(standingsIdStr),
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
        tableFinal = await getCompetitionTableFull(standingsIdStr, { season: sid });
      }
      setTable(tableFinal ?? table1);

      const scorersData = await getTopScorers(
        standingsIdStr,
        sid != null ? { season: sid } : undefined
      );
      setTopScorers(scorersData);
      setStandingsLoading(false);
      setTopScorersLoading(false);
    };

    void loadCompetitionData();
  }, [teamId, selectedCompetitionId]);

  /* ─── Memoized computed data ─── */

  const upcomingTeam = upcomingQuery.data?.team ?? null;
  const teamInfo = useMemo(() => {
    // Son maçı olmayan takım (ör. sezon başı): fikstür yanıtındaki takım adı/logosu yedek.
    if (lastMatches.length === 0) {
      return upcomingTeam?.name
        ? { name: upcomingTeam.name, logo: upcomingTeam.logo }
        : { name: 'Takım Detayı', logo: undefined as string | undefined };
    }
    const m = lastMatches[0];
    const isHome = m.home?.id?.toString() === teamId;
    const team = isHome ? m.home : m.away;
    return { name: team?.name || 'Takım Detayı', logo: team?.logo };
  }, [lastMatches, teamId, upcomingTeam]);

  const todayIso = todayIsoIstanbul();
  const fixtureGroups = useMemo(
    () => buildTeamFixtureGroups(upcomingQuery.data?.fixtures ?? [], todayIso),
    [upcomingQuery.data, todayIso]
  );
  const dayLabels = useMemo(
    () => ({ today: t('match:hub.fixtureToday'), tomorrow: t('match:hub.fixtureTomorrow') }),
    [t]
  );
  const nextFixture = nextTeamFixture(fixtureGroups);
  const nextOpponent = nextFixture ? teamOpponent(nextFixture, teamId)?.opponent : undefined;

  const stats = useMemo(
    () => computeTeamStats(lastMatches, teamId, table),
    [lastMatches, teamId, table]
  );

  const topScorersWithAppearances = useTopScorersWithAppearances(topScorers, sidebarTab === 'scorers');
  const squadStats = useTeamSquadStats(teamId, selectedSeasonId, activeTab === 'squad');

  const selectedCompName = useMemo(
    () => competitions.find((c) => String(c.id) === selectedCompetitionId)?.name || '',
    [competitions, selectedCompetitionId]
  );

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
          {nextFixture && nextOpponent?.name && (
            <span className={styles.teamNextMatch}>
              {t('nextMatch', {
                opponent: nextOpponent.name,
                when: nextFixtureWhen(nextFixture, todayIso, locale, dayLabels),
              })}
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
            {activeTab === 'fixtures' && (
              upcomingQuery.isLoading ? (
                <PanelSkeleton rows={6} />
              ) : upcomingQuery.isError ? (
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
                              <Image
                                src={opponent.logo}
                                alt=""
                                className={styles.matchTeamLogo}
                                width={18}
                                height={18}
                                unoptimized
                              />
                            )}
                            <span className={styles.matchTeamName}>{opponent?.name || ''}</span>
                          </span>
                          {match.competition?.name && (
                            <span className={styles.fixtureComp}>
                              {match.competition.logo && (
                                <Image
                                  src={match.competition.logo}
                                  alt=""
                                  className={styles.fixtureCompLogo}
                                  width={14}
                                  height={14}
                                  unoptimized
                                />
                              )}
                              <span className={styles.fixtureCompName}>{match.competition.name}</span>
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
                <LineupSkeleton />
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
                                  <img src={p.photo} alt="" className={styles.squadPhoto} width={28} height={28} loading="lazy" />
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
                    loading={bootstrapLoading || standingsLoading}
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
                    loading={bootstrapLoading || topScorersLoading}
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

              </div>
            </div>
          )}

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
    </div>
  );
}
