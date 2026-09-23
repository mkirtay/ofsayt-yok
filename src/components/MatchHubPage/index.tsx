import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useI18n, useTranslation } from '@/lib/i18n';
import { useQueryClient } from '@tanstack/react-query';
import {
  groupMatchesByLeague,
  mergeMatchesByIdForAllTab,
  mergeMatchesForAllTab,
  sortGroupedMatchesForAllTab,
} from '@/services/liveScoreService';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';
import type { Match } from '@/models/liveScore';
import {
  fetchCompetitionSidebarForSeason,
  useCompetitionSidebar,
} from '@/hooks/useCompetitionSidebar';
import {
  refreshHomeHubLiveFixtures,
  useHomeHubMatches,
} from '@/hooks/useHomeHubMatches';
import { useCompetitionFixtures } from '@/hooks/useCompetitionFixtures';
import { buildFixtureDateGroups } from '@/utils/fixtureDateGroups';
import { fixtureDateHeading } from '@/utils/fixtureDateLabel';
import MatchList, { type MatchListDateGroup } from '@/components/MatchList';
import { MatchListSkeleton } from '@/components/Skeleton';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchCompetitionTopScorers from '@/components/MatchCompetitionTopScorers';
import SubHeader, { type MatchTab } from '@/components/SubHeader';
import MatchDetailPanel from '@/components/MatchDetailPanel';
import TeamDetailPanel from '@/components/TeamDetailPanel';
import HubRightColumn from '@/components/HubWidgets/HubRightColumn';
import MiniStandingsWidget from '@/components/HubWidgets/MiniStandingsWidget';
import LeagueLogo from '@/components/LeagueLogo';
import { isUefaCupCompetitionId, type SidebarLeague } from '@/config/leagues';
import { resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';
import { resolveSidebarLeagueLogo } from '@/utils/leagueLogo';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { buildMatchHref } from '@/utils/matchUrl';
import {
  buildSelectionTarget,
  readSelectedMatchId,
  readSelectedMatchParam,
  readSelectedTeamId,
  buildTeamSelectionTarget,
} from '@/utils/matchSelection';
import {
  MATCH_TAB_QUERY,
  parseMatchTab,
  parseSidebarTab,
  SIDEBAR_PANEL_QUERY,
} from '@/utils/bottomNav';
import { MOBILE_LAYOUT_QUERY } from '@/config/breakpoints';
import { prefetchMatchDetail } from '@/hooks/useMatchDetail';
import { GUNDEM_PANEL_MIN_WIDTH, RIGHT_COLUMN_MIN_WIDTH, useMinWidth, useSplitView } from '@/hooks/useSplitView';
import GundemPanel from '@/components/GundemPanel';
import { resolveHubSidePanel } from '@/utils/hubSidePanel';
import LeagueFilterBar from '@/components/LeagueFilterBar';
import AdSlot from '@/components/AdSlot';
import EmptyState from '@/components/EmptyState';
import { useLeagueFilter } from '@/hooks/useLeagueFilter';
import { useTopScorersWithAppearances } from '@/hooks/useTopScorerAppearances';
import { buildLeagueCatalog, filterMatchesByLeagues } from '@/utils/leagueFilter';
import styles from '@/pages/index.module.scss';

type SidebarTab = 'standings' | 'leagues' | 'scorers';

export type MatchHubPageProps = {
  sidebarLeagues: SidebarLeague[];
  defaultCompetitionId: number;
  /** Doluysa maç listesi yalnızca bu `competition_id` değerleriyle sınırlı */
  allowedCompetitionIds: number[] | null;
};

const today = () => todayIsoIstanbul();

export default function MatchHubPage({
  sidebarLeagues,
  defaultCompetitionId,
  allowedCompetitionIds,
}: MatchHubPageProps) {
  const { t } = useTranslation('match');
  const { t: tg } = useTranslation('gundem');
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const splitView = useSplitView();
  const showRightColumn = useMinWidth(RIGHT_COLUMN_MIN_WIDTH) === true;
  const gundemPanelWide = useMinWidth(GUNDEM_PANEL_MIN_WIDTH) === true;
  const isSplit = splitView === true;
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [activeTab, setActiveTab] = useState<MatchTab>('all');

  // Varsayılan sekme Puan Durumu (Puan Durumu + Gol Krallığı varsayılan görünümde)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('standings');
  const [selectedCompId, setSelectedCompId] = useState(defaultCompetitionId);
  const homeMatchesQuery = useHomeHubMatches(selectedDate);
  /**
   * UEFA kupası seçiliyse maç listesi TEK GÜNE değil, o kupanın fikstürüne bakar: kupa maçları
   * salı–perşembe gibi birkaç güne yayıldığı için tek tarihli liste maç haftasını gösteremiyordu.
   * Yurt içi lig seçiliyken bu sorgu hiç çalışmaz (`enabled:false`) → eski davranış aynen korunur.
   */
  const uefaFixtureMode = isUefaCupCompetitionId(selectedCompId);
  const uefaFixturesQuery = useCompetitionFixtures(uefaFixtureMode ? selectedCompId : null);
  const {
    data: sidebarData,
    isLoading: sidebarQueryLoading,
    isFetching: sidebarQueryFetching,
  } = useCompetitionSidebar(selectedCompId);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [seasonPatch, setSeasonPatch] = useState<{
    standings: NonNullable<typeof sidebarData>['standings'];
    topScorers: NonNullable<typeof sidebarData>['topScorers'];
  } | null>(null);

  const seasons = sidebarData?.seasons ?? [];
  const standings = seasonPatch?.standings ?? sidebarData?.standings ?? null;
  const rawTopScorers = seasonPatch?.topScorers ?? sidebarData?.topScorers ?? null;
  const topScorers = useTopScorersWithAppearances(rawTopScorers, sidebarTab === 'scorers');
  const standingsLoading = sidebarQueryLoading || sidebarQueryFetching;
  const topScorersLoading = standingsLoading;

  useEffect(() => {
    setSelectedSeasonId(null);
    setSeasonPatch(null);
  }, [selectedCompId]);

  useEffect(() => {
    if (sidebarData?.selectedSeasonId != null && selectedSeasonId === null) {
      setSelectedSeasonId(sidebarData.selectedSeasonId);
    }
  }, [sidebarData?.selectedSeasonId, selectedSeasonId]);

  const [favoriteTeamIds, setFavoriteTeamIds] = useState<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshHomeHubLiveFixtures(queryClient, selectedDate);
    }, 30_000);
    return () => clearInterval(interval);
  }, [queryClient, selectedDate]);

  const handleSeasonChange = useCallback(async (seasonId: number) => {
    setSelectedSeasonId(seasonId);
    const patch = await fetchCompetitionSidebarForSeason(selectedCompId, seasonId);
    setSeasonPatch(patch);
  }, [selectedCompId]);

  const FAV_LS_KEY = 'oy_fav_club_teams';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_LS_KEY);
      if (raw) setFavoriteTeamIds(JSON.parse(raw) as number[]);
    } catch {}
  }, []);

  const toggleFavoriteTeam = useCallback((teamId: number) => {
    if (!teamId) return;
    setFavoriteTeamIds((prev) => {
      const next = prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId];
      try {
        localStorage.setItem(FAV_LS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const allMatches = homeMatchesQuery.data?.allMatches ?? [];
  const liveMatches = homeMatchesQuery.data?.liveMatches ?? [];
  const fixtureMatches = homeMatchesQuery.data?.fixtureMatches ?? [];
  const matchesLoading = homeMatchesQuery.isLoading;

  const favoriteTeamSet = useMemo(() => new Set(favoriteTeamIds), [favoriteTeamIds]);

  const displayMatches = useMemo(() => {
    const isFavMatch = (m: Match) =>
      favoriteTeamSet.has(m.home?.id ?? -1) || favoriteTeamSet.has(m.away?.id ?? -1);

    switch (activeTab) {
      case 'live':
        return liveMatches.filter(
          (m) => m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK'
        );
      case 'finished':
        return allMatches.filter((m) => m.status === 'FINISHED');
      case 'favorites': {
        const merged = isSportmonksProviderEnabled()
          ? mergeMatchesByIdForAllTab({
              selectedDate,
              historyPageMatches: allMatches,
              liveMatches,
              fixtures: fixtureMatches,
            })
          : mergeMatchesForAllTab({
              selectedDate,
              historyPageMatches: allMatches,
              liveMatches,
              fixtures: fixtureMatches,
            });
        return merged.filter(isFavMatch);
      }
      case 'all':
      default:
        return isSportmonksProviderEnabled()
          ? mergeMatchesByIdForAllTab({
              selectedDate,
              historyPageMatches: allMatches,
              liveMatches,
              fixtures: fixtureMatches,
            })
          : mergeMatchesForAllTab({
              selectedDate,
              historyPageMatches: allMatches,
              liveMatches,
              fixtures: fixtureMatches,
            });
    }
  }, [
    activeTab,
    allMatches,
    liveMatches,
    fixtureMatches,
    selectedDate,
    favoriteTeamSet,
  ]);

  const leagueFilter = useLeagueFilter();
  const leagueCatalog = useMemo(
    () => buildLeagueCatalog([...allMatches, ...liveMatches, ...fixtureMatches], leagueFilter.state.custom),
    [allMatches, liveMatches, fixtureMatches, leagueFilter.state.custom],
  );
  const leagueFilterActive = leagueFilter.state.mode !== 'all';

  const competitionFilterSet = useMemo(() => {
    if (!allowedCompetitionIds?.length) return null;
    return new Set(allowedCompetitionIds);
  }, [allowedCompetitionIds]);

  const filteredDisplayMatches = useMemo(() => {
    const allowed = competitionFilterSet
      ? displayMatches.filter((m) => competitionFilterSet.has(m.competition?.id ?? 0))
      : displayMatches;
    // Kullanıcının lig filtresi (Tümü/Süper Lig/5 Büyük Lig/Liglerim) — üst sekmeden bağımsız hepsine uygulanır.
    return filterMatchesByLeagues(allowed, leagueFilter.state);
  }, [displayMatches, competitionFilterSet, leagueFilter.state]);

  const grouped = useMemo(() => {
    const raw = groupMatchesByLeague(filteredDisplayMatches);
    return activeTab === 'all' ? sortGroupedMatchesForAllTab(raw) : raw;
  }, [activeTab, filteredDisplayMatches]);

  /**
   * UEFA fikstürü: bugünden itibaren güne göre gruplanır. Üst sekme (Canlı/Bitmiş/Favoriler) burada da
   * geçerli; lig chip filtresi (Tümü/Süper Lig/5 Büyük) UYGULANMAZ — kullanıcı zaten bir kupa seçti,
   * ikinci bir lig filtresi listeyi sessizce boşaltırdı.
   */
  const uefaDateGroups = useMemo<MatchListDateGroup[]>(() => {
    if (!uefaFixtureMode) return [];
    const source = uefaFixturesQuery.data ?? [];
    const byTab = source.filter((m) => {
      switch (activeTab) {
        case 'live':
          return m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK';
        case 'finished':
          return m.status === 'FINISHED';
        case 'favorites':
          return favoriteTeamSet.has(m.home?.id ?? -1) || favoriteTeamSet.has(m.away?.id ?? -1);
        default:
          return true;
      }
    });
    const todayIso = today();
    return buildFixtureDateGroups(byTab, { todayIso }).map((g) => ({
      date: g.date,
      label: fixtureDateHeading(g.date, todayIso, locale, {
        today: t('hub.fixtureToday'),
        tomorrow: t('hub.fixtureTomorrow'),
      }),
      matches: g.matches,
    }));
  }, [uefaFixtureMode, uefaFixturesQuery.data, activeTab, favoriteTeamSet, locale, t]);

  const selectedLeagueName =
    sidebarLeagues.find((l) => l.id === selectedCompId)?.name ?? 'Lig';

  // Canlı fikstürdeki `league.image_path` (→ `competition.logo`) — sidebar logolarının birincil kaynağı.
  // Fikstürde `competition.id` Sportmonks lig id'sidir; sidebar ise legacy id kullanır → eşle.
  const apiLogoBySportmonksLeagueId = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of [...allMatches, ...liveMatches, ...fixtureMatches]) {
      const c = m.competition;
      if (c?.id != null && c.logo && !map.has(c.id)) map.set(c.id, c.logo);
    }
    return map;
  }, [allMatches, liveMatches, fixtureMatches]);

  // ── URL query ↔ durum senkronu ─────────────────────────────────────────
  // `tab` (maç filtresi), `panel` (yan panel sekmesi), `match` (split-view seçimi).
  // Değişiklikler shallow `router.push/replace` ile yapılır: getServerSideProps/tam
  // sayfa yeniden render'ı tetiklenmez, yalnızca `router.query` güncellenir.
  const queryRef = useRef(router.query);
  useEffect(() => {
    queryRef.current = router.query;
  }, [router.query]);

  const replaceQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(queryRef.current)) {
        const first = Array.isArray(v) ? v[0] : v;
        if (typeof first === 'string') next[k] = first;
      }
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) delete next[k];
        else next[k] = v;
      }
      void router.replace({ pathname: router.pathname, query: next }, undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [router],
  );

  const handleTabChange = useCallback(
    (tab: MatchTab) => {
      setActiveTab(tab);
      replaceQuery({ [MATCH_TAB_QUERY]: tab === 'all' ? null : tab });
    },
    [replaceQuery],
  );

  const handleSidebarTabChange = useCallback(
    (tab: SidebarTab) => {
      setSidebarTab(tab);
      replaceQuery({ [SIDEBAR_PANEL_QUERY]: tab === 'standings' ? null : tab });
    },
    [replaceQuery],
  );

  const queryTab = router.query[MATCH_TAB_QUERY];
  const queryPanel = router.query[SIDEBAR_PANEL_QUERY];
  const queryLeague = router.query.league;
  const prevNavKey = useRef<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    setActiveTab(parseMatchTab(queryTab) ?? 'all');
    setSidebarTab(parseSidebarTab(queryPanel) ?? 'standings');

    // Mobil alt navigasyon: ilgili bölüme kaydır (yalnızca param DEĞİŞTİĞİNDE)
    const navKey = `${String(queryTab ?? '')}|${String(queryPanel ?? '')}`;
    if (prevNavKey.current !== null && prevNavKey.current !== navKey && window.matchMedia(MOBILE_LAYOUT_QUERY).matches) {
      const targetId = queryPanel ? 'hub-sidebar' : 'hub-list';
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevNavKey.current = navKey;
  }, [router.isReady, queryTab, queryPanel]);

  // Header aramasından gelen `?league=<id>` — ligi seç, param'ı temizle
  useEffect(() => {
    if (!router.isReady || queryLeague == null) return;
    const id = Number(Array.isArray(queryLeague) ? queryLeague[0] : queryLeague);
    if (Number.isFinite(id) && sidebarLeagues.some((l) => l.id === id)) {
      setSelectedCompId(id);
      setSidebarTab('standings');
    }
    replaceQuery({ league: null });
  }, [router.isReady, queryLeague, sidebarLeagues, replaceQuery]);

  // ── Split-view seçili maç ───────────────────────────────────────────────
  const selectedMatchParam = readSelectedMatchParam(router.query);
  const selectedMatchId = readSelectedMatchId(router.query);
  const selectedTeamId = readSelectedTeamId(router.query);
  // Tek panel: maç YA DA takım (URL'de biri; seçim helper'ları diğerini düşürür). Layout/liste bunu birlikte kullanır.
  const sidePanel = resolveHubSidePanel({
    isSplit,
    hasSelection: selectedMatchId != null || selectedTeamId != null,
    gundemPanelWide,
  });
  // Detay paneli (mevcut model: hubGridWithPanel/compact/fill) YALNIZCA seçim varken; idle Gündem paneli bunu tetiklemez.
  const showDetailPanel = sidePanel === 'detail';
  // Idle Gündem paneli (≥ BP_GUNDEM_PANEL, seçim yok): koşul false iken GundemPanel hiç mount edilmez → akış çekilmez.
  const showGundemPanel = sidePanel === 'gundem';

  const handleSelectMatch = useCallback(
    (match: Match) => {
      const href = buildMatchHref(match); // "/matches/{id}-{slug}"
      const param = href.slice('/matches/'.length);
      if (param === readSelectedMatchParam(queryRef.current)) return;
      // Her seçim bir geçmiş kaydı: tarayıcı geri/ileri tuşu seçimi geri alır/yineler.
      void router.push(buildSelectionTarget(router.pathname, queryRef.current, param), undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [router],
  );

  const handleSelectTeam = useCallback(
    (teamId: number) => {
      const id = String(teamId);
      if (id === readSelectedTeamId(queryRef.current)) return;
      void router.push(buildTeamSelectionTarget(router.pathname, queryRef.current, id), undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [router],
  );

  const handleCloseDetail = useCallback(() => {
    void router.push(buildSelectionTarget(router.pathname, queryRef.current, null), undefined, {
      shallow: true,
      scroll: false,
    });
  }, [router]);

  // Paylaşılan `/?team=…` linki dar ekranda (split yok) → takım tam sayfası.
  const selectedTeamParam = readSelectedTeamId(router.query);
  useEffect(() => {
    if (!router.isReady || splitView !== false || !selectedTeamParam) return;
    void router.replace(`/teams/${selectedTeamParam}`);
  }, [router, splitView, selectedTeamParam]);

  // Paylaşılan `/?match=…` linki dar ekranda (split yok) açılırsa tam sayfaya yönlendir.
  useEffect(() => {
    if (!router.isReady || splitView !== false || !selectedMatchParam) return;
    void router.replace(`/matches/${selectedMatchParam}`);
  }, [router, splitView, selectedMatchParam]);

  function handleLeagueClick(competitionId: number) {
    setSelectedCompId(competitionId);
    handleSidebarTabChange('standings');
  }

  const listNode = uefaFixtureMode ? (
    uefaFixturesQuery.isLoading ? (
      <MatchListSkeleton groups={5} />
    ) : uefaDateGroups.length === 0 ? (
      <EmptyState>{t('hub.fixtureEmpty')}</EmptyState>
    ) : (
      <MatchList
        dateGroups={uefaDateGroups}
        favoriteTeamIds={favoriteTeamSet}
        onToggleFavorite={toggleFavoriteTeam}
        onSelectMatch={isSplit ? handleSelectMatch : undefined}
        onPrefetchMatch={isSplit ? prefetchMatchDetail : undefined}
        onSelectTeam={isSplit ? handleSelectTeam : undefined}
        selectedMatchId={showDetailPanel ? selectedMatchId : null}
        compact={showDetailPanel}
        fill={showDetailPanel}
      />
    )
  ) : matchesLoading ? (
    <MatchListSkeleton groups={5} />
  ) : activeTab === 'favorites' && favoriteTeamIds.length === 0 ? (
    <div className={styles.empty}>
      {t('hub.favoritesEmpty')}
    </div>
  ) : leagueFilterActive && grouped.length === 0 ? (
    <EmptyState>
      {t('hub.leagueFilterEmpty')}{' '}
      <button type="button" className={styles.emptyAction} onClick={() => leagueFilter.selectMode('all')}>
        {t('hub.showAll')}
      </button>
    </EmptyState>
  ) : (
    <>
      <MatchList
        groupedMatches={grouped}
        favoriteTeamIds={favoriteTeamSet}
        onToggleFavorite={toggleFavoriteTeam}
        // Split-view yalnızca masaüstünde; mobilde tam sayfa (push) navigasyon korunur.
        onSelectMatch={isSplit ? handleSelectMatch : undefined}
        onPrefetchMatch={isSplit ? prefetchMatchDetail : undefined}
        onSelectTeam={isSplit ? handleSelectTeam : undefined}
        selectedMatchId={showDetailPanel ? selectedMatchId : null}
        compact={showDetailPanel}
        fill={showDetailPanel}
      />
    </>
  );

  return (
    <>
      <SubHeader
        selectedDate={selectedDate}
        onDateChange={(d) => {
          setSelectedDate(d);
        }}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
      <div className={`${styles.hubShell} ${styles.hubShellWithLeagueBar}`}>
        <div className={styles.leagueBarRow}>
          <LeagueFilterBar
            state={leagueFilter.state}
            catalog={leagueCatalog}
            onSelectMode={leagueFilter.selectMode}
            onApplyCustom={leagueFilter.applyCustom}
          />
        </div>
        <div
          className={[
            styles.hubGrid,
            showDetailPanel ? styles.hubGridWithPanel : '',
            showRightColumn ? styles.hubGridWithRight : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <aside id="hub-sidebar" className={styles.hubSidebar}>
            <div className={styles.sidebar}>
              <nav className={styles.sidebarTabs}>
                <button
                  type="button"
                  className={`${styles.sidebarTab} ${sidebarTab === 'standings' ? styles.sidebarTabActive : ''}`}
                  onClick={() => handleSidebarTabChange('standings')}
                >
                  {t('hub.tabStandings')}
                </button>
                <button
                  type="button"
                  className={`${styles.sidebarTab} ${sidebarTab === 'leagues' ? styles.sidebarTabActive : ''}`}
                  onClick={() => handleSidebarTabChange('leagues')}
                >
                  {t('hub.tabLeagues')}
                </button>
                <button
                  type="button"
                  className={`${styles.sidebarTab} ${sidebarTab === 'scorers' ? styles.sidebarTabActive : ''}`}
                  onClick={() => handleSidebarTabChange('scorers')}
                >
                  {t('hub.tabScorers')}
                </button>
              </nav>

              <div className={styles.sidebarContent}>
                {sidebarTab === 'standings' && (
                  <MatchCompetitionStandings
                    data={standings}
                    loading={standingsLoading}
                    competitionName={selectedLeagueName}
                    seasons={seasons}
                    selectedSeasonId={selectedSeasonId}
                    onSeasonChange={handleSeasonChange}
                  />
                )}

                {sidebarTab === 'scorers' && (
                  <MatchCompetitionTopScorers
                    data={topScorers}
                    loading={topScorersLoading}
                    seasons={seasons}
                    selectedSeasonId={selectedSeasonId}
                    onSeasonChange={handleSeasonChange}
                  />
                )}

                {sidebarTab === 'leagues' && (
                  <ul className={styles.leagueList}>
                    {sidebarLeagues.map((league) => {
                      const smId = resolveSportmonksLeagueId(league.id);
                      const logoUrl = resolveSidebarLeagueLogo(
                        league,
                        smId != null ? apiLogoBySportmonksLeagueId.get(smId) : undefined,
                      );
                      return (
                        <li key={league.id}>
                          <button
                            type="button"
                            className={`${styles.leagueItem} ${league.id === selectedCompId ? styles.leagueItemActive : ''}`}
                            onClick={() => handleLeagueClick(league.id)}
                          >
                            <LeagueLogo src={logoUrl} className={styles.leagueFlag} size={20} />
                            <span>{league.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

              </div>
            </div>
            <AdSlot slot="hub-sidebar" format="rectangle" desktopOnly />
          </aside>
          <div id="hub-list" className={styles.hubMain}>
            <div className={styles.hubList}>
              {uefaFixtureMode ? (
                <div className={styles.fixtureModeBar}>
                  <span className={styles.fixtureModeText}>
                    <strong className={styles.fixtureModeTitle}>
                      {t('hub.fixtureModeTitle', { league: selectedLeagueName })}
                    </strong>
                    <span className={styles.fixtureModeHint}>{t('hub.fixtureModeHint')}</span>
                  </span>
                  <button
                    type="button"
                    className={styles.fixtureModeExit}
                    onClick={() => setSelectedCompId(defaultCompetitionId)}
                  >
                    {t('hub.fixtureModeExit')}
                  </button>
                </div>
              ) : null}
              {listNode}
            </div>
            {showDetailPanel ? (
              <div className={styles.hubDetail}>
                {selectedTeamId ? (
                  <TeamDetailPanel teamId={selectedTeamId} onClose={handleCloseDetail} />
                ) : selectedMatchId ? (
                  <MatchDetailPanel matchId={selectedMatchId} onClose={handleCloseDetail} />
                ) : null}
              </div>
            ) : null}
            {showGundemPanel ? (
              <aside className={styles.hubGundem} aria-label={tg('title')}>
                <div className={styles.hubGundemHeader}>
                  <h2 className={styles.hubGundemTitle}>{tg('title')}</h2>
                  <Link href="/gundem" className={styles.hubGundemLink}>
                    {tg('panel.openPage')}
                  </Link>
                </div>
                <GundemPanel
                  scope="all"
                  composer="post-inline"
                  onOpenPost={(postId) => void router.push(`/gundem/${postId}`)}
                />
              </aside>
            ) : null}
          </div>
          {showRightColumn ? (
            <HubRightColumn>
              <MiniStandingsWidget
                data={standings}
                loading={standingsLoading}
                competitionName={selectedLeagueName}
                onShowAll={() => handleSidebarTabChange('standings')}
              />
            </HubRightColumn>
          ) : null}
        </div>
      </div>
    </>
  );
}
