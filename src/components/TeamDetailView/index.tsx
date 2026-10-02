/* eslint-disable @typescript-eslint/no-explicit-any -- Kadro / puan API gevşek şema */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQueries, useQuery } from '@tanstack/react-query';
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
  type CompetitionTableData,
  type CompetitionTableStandingRow,
  type SeasonListItem,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import { competitionLogoNeedsBackdrop, uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';
import { toStandingsCompetitionId } from '@/services/sportmonksProviderFlag';
import { campaignSlug, defaultCompetitionId, selectableCampaigns, teamForm } from '@/services/sportmonks/teamOverview';
import SeasonSelect from '@/components/SeasonSelect';
import { formatSeasonLabel } from '@/utils/seasonLabel';
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
  nextTeamFixture,
  teamOpponent,
} from '@/utils/teamFixtures';
import styles from './teamDetailView.module.scss';
import TeamLogo from '@/components/TeamLogo';
import TeamHeaderCard, { type HeaderLiveMatch, type HeaderNextMatch, type HeaderStanding } from './TeamHeaderCard';
import { countdownLabel, nextMatchCountdown, recentMatchStatus } from './recentMatchLabels';
import { istanbulMatchDate } from '@/utils/fixtureDateGroups';
import { formatFixtureDate } from '@/utils/fixtureDateLabel';
import RecentMatches from './RecentMatches';
import SeasonSummaryCard, { type TournamentTab } from './SeasonSummaryCard';
import TeamScorersCard from './TeamScorersCard';
import ScoringMinutesCard from './ScoringMinutesCard';
import SidelinedCard from './SidelinedCard';
import { mapTeamSidelined } from '@/services/sportmonks/teamSidelined';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import { getTeamSeasonMatches, getTeamSeasonScorers, getTeamSeasonStats } from '@/services/teamPage';
import { getTopScorersWithAppearances } from '@/services/competitionTopScorers';
import { combineSeasonStats } from '@/services/sportmonks/teamSeasonStats';
import { mergeTeamScorers } from '@/services/sportmonks/teamScorers';

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
  // Puan durumu ilk kez yerleşti mi (sağ kolondaki kartlar ondan sonra çizilir; iskelet → tablo büyümesi onları kaydırmasın).
  const [standingsSettled, setStandingsSettled] = useState(false);
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
        setStandingsSettled(true);
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
      setStandingsSettled(true);
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
      getTopScorersWithAppearances(standingsCompetitionId, selectedSeasonId != null ? { season: selectedSeasonId } : undefined),
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

  /* ─── Sezon seçici (Son Maçlar + Sezon Özeti + Takım Krallığı ortak) ─── */
  // Sayfada seçili sezon URL'de (`?sezon=2025-2026`, güncel sezonda yok); ana sayfa panelinde yerel durum.
  const router = useRouter();
  const seasonOptions = useMemo(
    () => selectableCampaigns(overviewQuery.data?.campaigns ?? [], defaultCompId),
    [overviewQuery.data, defaultCompId],
  );
  const [panelSeasonSlug, setPanelSeasonSlug] = useState<string | null>(null);
  const urlSeasonSlug = typeof router.query.sezon === 'string' ? router.query.sezon : null;
  const seasonSlug = variant === 'page' ? urlSeasonSlug : panelSeasonSlug;
  const campaignIdx = Math.max(0, seasonOptions.findIndex((c) => campaignSlug(c.name) === seasonSlug));
  const campaign = seasonOptions[campaignIdx] ?? overviewQuery.data?.campaigns[0] ?? null;
  const isCurrentCampaign = campaignIdx === 0;
  const seasonSelectItems = useMemo(() => seasonOptions.map((c, i) => ({ id: i, name: c.name })), [seasonOptions]);
  const changeCampaign = useCallback(
    (idx: number) => {
      const slug = idx > 0 && seasonOptions[idx] ? campaignSlug(seasonOptions[idx]!.name) : null;
      if (variant !== 'page') {
        setPanelSeasonSlug(slug);
        return;
      }
      const query = { ...router.query };
      if (slug) query.sezon = slug;
      else delete query.sezon;
      void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
    },
    [router, seasonOptions, variant],
  );
  const seasonPicker =
    seasonSelectItems.length > 1 ? (
      <SeasonSelect seasons={seasonSelectItems} value={campaignIdx} onChange={changeCampaign} />
    ) : null;

  // Geçmiş sezon: turnuva-sezon başına bir program isteği, yalnız seçilince (ilk yüke girmez).
  const pastMatchesQuery = useQuery({
    queryKey: ['team-season-matches', teamId, campaign?.name ?? ''] as const,
    queryFn: () => getTeamSeasonMatches(teamId, campaign?.seasons ?? []),
    enabled: !isCurrentCampaign && Boolean(campaign?.seasons.length),
    staleTime: 30 * 60_000,
  });
  const listMatches = isCurrentCampaign ? recentMatches : (pastMatchesQuery.data ?? []);
  const listLoading = isCurrentCampaign ? overviewLoading : !pastMatchesQuery.data && !pastMatchesQuery.isError;
  const listError = isCurrentCampaign ? overviewQuery.isError : pastMatchesQuery.isError;
  const listScope = isCurrentCampaign
    ? t('season.recentScope')
    : pastMatchesQuery.data
      ? t('season.pastScope', { season: formatSeasonLabel(campaign?.name ?? ''), count: pastMatchesQuery.data.length })
      : t('season.pastLoading', { season: formatSeasonLabel(campaign?.name ?? '') });

  /* ─── Sezon Özeti + Takım Krallığı (ekranın altında: görünür alana yaklaşınca yüklenir) ─── */
  const campaignSeasonIds = useMemo(() => campaign?.seasons.map((s) => s.id) ?? [], [campaign]);
  const [summaryRef, summaryInView] = useInViewOnce<HTMLElement>();
  const statsQuery = useQuery({
    queryKey: ['team-season-stats', teamId, campaignSeasonIds.join(',')] as const,
    queryFn: () => getTeamSeasonStats(teamId, campaignSeasonIds),
    enabled: summaryInView && campaignSeasonIds.length > 0,
    staleTime: 10 * 60_000,
  });
  const [tournament, setTournament] = useState('all');

  const { tournamentTabs, playedStats } = useMemo(() => {
    const refs = new Map((campaign?.seasons ?? []).map((s) => [s.id, s]));
    const played = (statsQuery.data?.stats ?? []).filter((s) => s.total.played > 0);
    // Varsayılan turnuva (genelde yerel lig) önce, sonra sezon başlangıcına göre.
    const order = (id: number) => {
      const ref = refs.get(id);
      return (ref?.leagueId === defaultCompId ? '0' : '1') + (ref?.startingAt ?? '');
    };
    played.sort((a, b) => order(a.seasonId).localeCompare(order(b.seasonId)));
    const tabs: TournamentTab[] = [{ key: 'all', label: t('summary.all'), fullLabel: t('summary.allFull') }];
    for (const st of played) {
      const ref = refs.get(st.seasonId);
      const leagueId = st.leagueId ?? ref?.leagueId;
      const logo = ref?.leagueLogo ?? (leagueId ? uefaCompetitionLogoSrcById(leagueId) : undefined);
      tabs.push({
        key: String(st.seasonId),
        label: leagueNameById(leagueId, ref?.leagueName, tl),
        fullLabel: leagueNameById(leagueId, ref?.leagueName, tl, 'full'),
        ...(logo ? { logo } : {}),
        logoBackdrop: leagueId != null && competitionLogoNeedsBackdrop(leagueId),
      });
    }
    return { tournamentTabs: tabs, playedStats: played };
  }, [campaign, statsQuery.data, defaultCompId, t, tl]);

  const activeTournament = tournamentTabs.some((tab) => tab.key === tournament) ? tournament : 'all';
  const selectedSeasonStats =
    activeTournament === 'all'
      ? playedStats.length > 0
        ? combineSeasonStats(playedStats)
        : null
      : (playedStats.find((st) => String(st.seasonId) === activeTournament) ?? null);
  const selectedTournamentLeagueId =
    activeTournament === 'all' ? null : (playedStats.find((st) => String(st.seasonId) === activeTournament)?.leagueId ?? null);
  const summaryFooter =
    isCurrentCampaign && stats.standing && selectedCompShort && (activeTournament === 'all' || String(selectedTournamentLeagueId) === selectedCompetitionId)
      ? t('summary.standing', {
          competition: selectedCompShort,
          rank: stats.standing.rank,
          points: stats.standing.points,
          gd: Number(stats.standing.goal_diff) > 0 ? `+${stats.standing.goal_diff}` : String(stats.standing.goal_diff ?? 0),
        })
      : null;

  const [scorersRef, scorersInView] = useInViewOnce<HTMLElement>();
  const scorerQueries = useQueries({
    queries: campaignSeasonIds.map((sid) => ({
      queryKey: ['team-season-scorers', teamId, sid] as const,
      queryFn: () => getTeamSeasonScorers(teamId, sid, campaign?.seasons.find((x) => x.id === sid)?.finished === true),
      enabled: scorersInView,
      staleTime: 30 * 60_000,
    })),
  });
  const scorerSeasonIdx = campaignSeasonIds
    .map((sid, i) => (activeTournament === 'all' || String(sid) === activeTournament ? i : -1))
    .filter((i) => i >= 0);
  const scorersLoading =
    campaignSeasonIds.length === 0 || scorerSeasonIdx.some((i) => !scorerQueries[i]?.data && !scorerQueries[i]?.isError);
  const scorersError = scorerSeasonIdx.length > 0 && scorerSeasonIdx.every((i) => scorerQueries[i]?.isError);
  const scorerPlayers = scorersLoading ? [] : mergeTeamScorers(scorerSeasonIdx.map((i) => scorerQueries[i]?.data ?? []));
  const scorersScope = tournamentTabs.find((tab) => tab.key === activeTournament)?.fullLabel ?? t('summary.allFull');

  // Sayfada sağ kolon: puan durumu (değişken yükseklik) en üstte → altındaki kartlar o yerleşince eklenir.
  // Turnuva yoksa (ör. puan durumu olmayan takım) takım isteği gelince.
  const rightCardsReady =
    variant === 'panel' || (!overviewLoading && (standingsSettled || (!selectedCompetitionId && defaultCompId == null)));

  // Sakat/cezalılar: takımın bugünkü durumu → hep GÜNCEL sezonun istatistik isteğinden (aynı sorgu anahtarı:
  // güncel sezon seçiliyken Sezon Özeti ile tek istek; eski sezon seçiliyken güncel isteğin önbelleği).
  const currentSeasonIds = useMemo(() => seasonOptions[0]?.seasons.map((x) => x.id) ?? [], [seasonOptions]);
  const [sidelinedRef, sidelinedInView] = useInViewOnce<HTMLElement>();
  const sidelinedQuery = useQuery({
    queryKey: ['team-season-stats', teamId, currentSeasonIds.join(',')] as const,
    queryFn: () => getTeamSeasonStats(teamId, currentSeasonIds),
    enabled: (sidelinedInView || (summaryInView && isCurrentCampaign)) && currentSeasonIds.length > 0,
    staleTime: 10 * 60_000,
  });
  const sidelined = useMemo(
    () => (sidelinedQuery.data ? mapTeamSidelined(sidelinedQuery.data.sidelined, todayIso) : null),
    [sidelinedQuery.data, todayIso],
  );


  /* ─── Üst kart (TeamHeaderCard) verisi ─── */
  const headerStanding: HeaderStanding | null = useMemo(() => {
    if (!stats.standing || !selectedCompShort) return null;
    const comp = competitions.find((c) => String(c.id) === selectedCompetitionId);
    const logo = comp?.logo ?? (comp ? uefaCompetitionLogoSrcById(comp.id) : undefined);
    return {
      competition: selectedCompShort,
      ...(logo ? { competitionLogo: logo } : {}),
      logoBackdrop: comp ? competitionLogoNeedsBackdrop(comp.id) : false,
      rank: Number(stats.standing.rank),
      points: Number(stats.standing.points),
    };
  }, [stats.standing, selectedCompShort, competitions, selectedCompetitionId]);

  const headerLive: HeaderLiveMatch | null = useMemo(() => {
    const m = recentMatches.find((x) => x.status === 'IN PLAY' || (x.status === 'HALF TIME BREAK' && !x.state_code));
    if (!m) return null;
    const st = recentMatchStatus(m);
    return {
      href: buildMatchHref(m),
      minute: st.kind === 'special' ? '' : st.text,
      home: { name: m.home?.name ?? '', ...(m.home?.logo ? { logo: m.home.logo } : {}) },
      away: { name: m.away?.name ?? '', ...(m.away?.logo ? { logo: m.away.logo } : {}) },
      score: m.scores?.score ?? '0-0',
    };
  }, [recentMatches]);

  const headerNext: HeaderNextMatch | null = useMemo(() => {
    if (!nextFixture) return null;
    const side = teamOpponent(nextFixture, teamId);
    if (!side) return null;
    const time = nextFixture.time_tbd || !nextFixture.scheduled ? null : utcTimeToTr(nextFixture.scheduled, nextFixture.date);
    const countdown = countdownLabel(nextMatchCountdown(nextFixture, todayIso), time, t);
    const comp = nextFixture.competition;
    const compLogo = comp?.logo ?? (comp?.id ? uefaCompetitionLogoSrcById(comp.id) : undefined);
    return {
      href: buildMatchHref(nextFixture),
      opponent: side.opponent.name,
      ...(side.opponent.logo ? { opponentLogo: side.opponent.logo } : {}),
      day: formatFixtureDate(istanbulMatchDate(nextFixture), locale),
      time,
      competition: comp?.id ? leagueNameById(comp.id, comp.name, tl) : '',
      ...(compLogo ? { competitionLogo: compLogo } : {}),
      logoBackdrop: comp?.id ? competitionLogoNeedsBackdrop(comp.id) : false,
      countdown,
      isHome: side.isHome,
    };
  }, [nextFixture, teamId, todayIso, locale, t, tl]);

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

      <TeamHeaderCard
        loading={overviewLoading}
        name={teamInfo.name}
        logo={teamInfo.logo}
        standing={headerStanding}
        standingLoading={standingsLoading || (Boolean(selectedCompetitionId) && !table && standingsCompetitionIdNum != null)}
        next={headerNext}
        live={headerLive}
        form={headerForm}
        coach={overviewQuery.data?.coach?.name}
        venue={overviewQuery.data?.venue}
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
          <div className={styles.tabsBlock}>
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
              <>
                <div className={styles.recentToolbar}>
                  <span className={styles.recentScope}>{listScope}</span>
                  {seasonPicker}
                </div>
                <RecentMatches
                  key={`${teamId}:${campaign?.name ?? ''}`}
                  matches={listMatches}
                  loading={listLoading}
                  error={listError}
                />
              </>
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

          <SeasonSummaryCard
            cardRef={summaryRef}
            loading={!statsQuery.data && !statsQuery.isError}
            error={statsQuery.isError}
            tabs={tournamentTabs}
            selected={activeTournament}
            onSelect={setTournament}
            stats={selectedSeasonStats}
            footer={summaryFooter}
            headerRight={seasonPicker}
          />

          <ScoringMinutesCard
            loading={!statsQuery.data && !statsQuery.isError}
            error={statsQuery.isError}
            scored={selectedSeasonStats?.scoredByMinute ?? []}
            conceded={selectedSeasonStats?.concededByMinute ?? []}
            scope={`${formatSeasonLabel(campaign?.name ?? '')} · ${scorersScope}`}
          />
        </div>

        {/* — Right Column — */}
        <div className={styles.layoutRight}>
          {/* Panelde (ana sayfa) global sidebar aynı Puan Durumu/Ligler/Gol Krallığı'nı zaten gösterir → yalnızca sayfa varyantında. */}
          {variant === 'page' && (
            <div className={`${hubStyles.sidebar} ${styles.sidebarSlot}`}>
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

          {rightCardsReady ? (
            <TeamScorersCard
              cardRef={scorersRef}
              loading={scorersLoading && !scorersError}
              error={scorersError}
              players={scorerPlayers}
              scope={scorersScope}
            />
          ) : null}
          {rightCardsReady ? (
            <SidelinedCard
              cardRef={sidelinedRef}
              loading={!sidelinedQuery.data && !sidelinedQuery.isError}
              error={sidelinedQuery.isError}
              data={sidelined}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
