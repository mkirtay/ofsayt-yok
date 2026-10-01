import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useI18n, useTranslation } from '@/lib/i18n';
import {
  groupMatchesByLeague,
  mergeMatchesByIdForAllTab,
  mergeMatchesForAllTab,
  sortGroupedMatchesForAllTab,
} from '@/services/liveScoreService';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';
import type { Match } from '@/models/liveScore';
import type { CompetitionTableData } from '@/services/liveScoreService';
import {
  fetchCompetitionStandingsForSeason,
  useCompetitionSidebar,
  useCompetitionTopScorers,
} from '@/hooks/useCompetitionSidebar';
import { useHomeHubMatches } from '@/hooks/useHomeHubMatches';
import { SEEDED_STALE_UPDATED_AT, useHomeInitialSeed } from '@/hooks/useHomeInitialSeed';
import type { HomeInitialData } from '@/utils/homeInitialData';
import NextMatchDayNotice from '@/components/NextMatchDayNotice';
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
import LeagueLogo from '@/components/LeagueLogo';
import { isUefaCupCompetitionId, type SidebarLeague } from '@/config/leagues';
import { resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';
import { resolveSidebarLeagueLogo } from '@/utils/leagueLogo';
import { leagueDisplayName, leagueNameById } from '@/utils/leagueName';
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
import { GUNDEM_PANEL_MIN_WIDTH, useMinWidth, useSplitView } from '@/hooks/useSplitView';
import HomeGundemPanel from '@/components/HomeGundemPanel';
import { resolveHubSidePanel } from '@/utils/hubSidePanel';
import LeagueFilterBar from '@/components/LeagueFilterBar';
import AdSlot from '@/components/AdSlot';
import EmptyState from '@/components/EmptyState';
import { useLeagueFilter } from '@/hooks/useLeagueFilter';
import { useTopScorersWithAppearances } from '@/hooks/useTopScorerAppearances';
import { activeCompetitionIds, buildLeagueCatalog, filterMatchesByLeagues } from '@/utils/leagueFilter';
import styles from '@/pages/index.module.scss';

type SidebarTab = 'standings' | 'leagues' | 'scorers';

/** Tablodaki toplam satır (düz tablo ya da aşama/grup tabloları). */
function standingsTableRowCount(data: CompetitionTableData | null): number {
  if (!data) return 0;
  if (Array.isArray(data.table) && data.table.length) return data.table.length;
  return (data.stages ?? []).reduce(
    (sum, st) => sum + (st.groups ?? []).reduce((g, gr) => g + (gr.standings?.length ?? 0), 0),
    0,
  );
}

export type MatchHubPageProps = {
  sidebarLeagues: SidebarLeague[];
  defaultCompetitionId: number;
  /** Doluysa maç listesi yalnızca bu `competition_id` değerleriyle sınırlı */
  allowedCompetitionIds: number[] | null;
  /** ISR'ın üretildiği TR günü: ilk render (sunucu = istemci) bu günle başlar, mount'ta gerçek gün farklıysa geçilir. */
  initialDate?: string;
  /** ISR ilk ekran verisi (bkz. server/homeInitialData.ts); yoksa veri tarayıcıda çekilir. */
  initialData?: HomeInitialData | null;
};

const today = () => todayIsoIstanbul();

export default function MatchHubPage({
  sidebarLeagues,
  defaultCompetitionId,
  allowedCompetitionIds,
  initialDate,
  initialData,
}: MatchHubPageProps) {
  // Çocuk sorgular abone olmadan önce: ISR verisi react-query'ye aynı anahtarlarla yazılır.
  useHomeInitialSeed(initialData);
  const { t } = useTranslation('match');
  const { t: tg } = useTranslation('gundem');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const router = useRouter();
  const splitView = useSplitView();
  const gundemPanelWide = useMinWidth(GUNDEM_PANEL_MIN_WIDTH) === true;
  const isSplit = splitView === true;
  // Render'da `today()` çağrılmaz: sunucu (üretim günü) ile istemcinin ilk render'ı aynı olmalı (hydration).
  const [todayIso, setTodayIso] = useState<string>(() => initialDate ?? today());
  const [selectedDate, setSelectedDate] = useState<string>(() => initialDate ?? today());
  useEffect(() => {
    const real = today();
    if (real === todayIso) return;
    // Bayat HTML (ör. gece yarısından önce üretilmiş): "bugün" gerçek güne geçer; kullanıcı başka gün seçtiyse dokunma.
    // Saat sunucuda farklı olabildiği için render'da değil mount'ta okunur (hydration) — nadir, tek seferlik düzeltme.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTodayIso(real);
    setSelectedDate((prev) => (prev === todayIso ? real : prev));
    // Yalnızca mount'ta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const { data: sidebarData, isLoading: sidebarQueryLoading } = useCompetitionSidebar(selectedCompId);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [seasonPatch, setSeasonPatch] = useState<{
    seasonId: number;
    standings: NonNullable<typeof sidebarData>['standings'];
  } | null>(null);

  const seasons = sidebarData?.seasons ?? [];
  const effectiveSeasonId = selectedSeasonId ?? sidebarData?.selectedSeasonId ?? null;
  const standings =
    (seasonPatch && seasonPatch.seasonId === effectiveSeasonId ? seasonPatch.standings : null) ??
    sidebarData?.standings ??
    null;
  // Gol krallığı yalnızca sekme açıkken (ayrı sorgu): gizli sekme için her açılışta 4 sayfa çekilmesin.
  const scorersOpen = sidebarTab === 'scorers';
  const topScorersQuery = useCompetitionTopScorers(selectedCompId, effectiveSeasonId, scorersOpen && !sidebarQueryLoading);
  const topScorers = useTopScorersWithAppearances(topScorersQuery.data ?? null, scorersOpen);
  // Yalnızca ilk yükleme iskelet gösterir; arka plandaki tazeleme mevcut tabloyu yerinde bırakır (kayma yok).
  const standingsLoading = sidebarQueryLoading;
  // Yükleniyor görünümünün satır sayısı: bu ligin son görülen tablosu; yoksa lig tipine göre (yerli 18, UEFA lig aşaması 36).
  // (React'in "önceki render'dan bilgi saklama" kalıbı: render sırasında koşullu setState.)
  const [standingsRowsSeen, setStandingsRowsSeen] = useState<Record<number, number>>({});
  const standingsRowCount = standingsTableRowCount(standings);
  if (standingsRowCount > 0 && standingsRowsSeen[selectedCompId] !== standingsRowCount) {
    setStandingsRowsSeen({ ...standingsRowsSeen, [selectedCompId]: standingsRowCount });
  }
  const standingsLoadingRows =
    standingsRowsSeen[selectedCompId] ?? (isUefaCupCompetitionId(selectedCompId) ? 36 : 18);
  const topScorersLoading = sidebarQueryLoading || topScorersQuery.isLoading;

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

  // Polling `useHomeHubMatches` içinde (react-query `refetchInterval`): canlı/başlamak üzere maç varken
  // 30 sn, yoksa 5 dk; sekme gizliyken durur.

  const handleSeasonChange = useCallback(async (seasonId: number) => {
    setSelectedSeasonId(seasonId);
    const table = await fetchCompetitionStandingsForSeason(selectedCompId, seasonId);
    setSeasonPatch({ seasonId, standings: table });
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
  // Veri hiç gelmediyse iskelet yerine hata notu; önceki veri varken hata/eski veri → küçük "gecikmeli" notu.
  const matchesFailed = homeMatchesQuery.isError && !homeMatchesQuery.data;
  const matchesDelayed = Boolean(homeMatchesQuery.data) && (homeMatchesQuery.isError || Boolean(homeMatchesQuery.data?.stale));
  const matchesUpdatedAt = homeMatchesQuery.dataUpdatedAt;

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
    () => buildLeagueCatalog([...allMatches, ...liveMatches, ...fixtureMatches], leagueFilter.state.custom, tl),
    [allMatches, liveMatches, fixtureMatches, leagueFilter.state.custom, tl],
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
    return buildFixtureDateGroups(byTab, { todayIso }).map((g) => ({
      date: g.date,
      label: fixtureDateHeading(g.date, todayIso, locale, {
        today: t('hub.fixtureToday'),
        tomorrow: t('hub.fixtureTomorrow'),
      }),
      matches: g.matches,
    }));
  }, [uefaFixtureMode, uefaFixturesQuery.data, activeTab, favoriteTeamSet, locale, t, todayIso]);

  const selectedLeague = sidebarLeagues.find((l) => l.id === selectedCompId);
  // Takım sayfası / maç detayı ile aynı kısa ad ("Süper Lig"): Sportmonks id → `leagues.short.*`;
  // eşleme yoksa (ör. Sportmonks kapalı) config'in kısa adı.
  const selectedLeagueName = selectedLeague
    ? leagueNameById(resolveSportmonksLeagueId(selectedLeague.id), leagueDisplayName(selectedLeague, tl), tl)
    : tl('fallback');

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

  /** Seçili gün (bugün ya da ileri) tümüyle boşsa sıradaki maç günü gösterilir — yalnız "Tümü" sekmesinde. */
  const showNextMatchDay = activeTab === 'all' && selectedDate >= todayIso;

  const delayedNote = matchesDelayed ? (
    <div className={styles.delayedNote} role="status">
      {matchesUpdatedAt <= SEEDED_STALE_UPDATED_AT
        ? // Sayfayla gelen (ISR) veri tazelenemedi: verinin saati bilinmiyor.
          t('hub.dataDelayedNoTime')
        : t('hub.dataDelayed', {
            time: new Date(matchesUpdatedAt).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Istanbul',
            }),
          })}
    </div>
  ) : null;

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
        fill={showDetailPanel || showGundemPanel}
        // Dar görünümde içerik kadar; ≥ split CSS'le sabit yüksekliğe döner (JS ölçümü beklenmez → SSR = istemci).
        fitContent="belowSplit"
      />
    )
  ) : matchesFailed ? (
    <EmptyState>
      {t('hub.loadFailed')}{' '}
      <button type="button" className={styles.emptyAction} onClick={() => void homeMatchesQuery.refetch()}>
        {t('hub.retry')}
      </button>
    </EmptyState>
  ) : matchesLoading ? (
    // Liste kutusunun tavanıyla aynı yükseklik: dolu günde iskelet → liste geçişi kaymasız.
    <div className={styles.listSkeleton}>
      <MatchListSkeleton groups={5} />
    </div>
  ) : activeTab === 'favorites' && favoriteTeamIds.length === 0 ? (
    <div className={styles.empty}>
      {t('hub.favoritesEmpty')}
    </div>
  ) : leagueFilterActive && grouped.length === 0 ? (
    <EmptyState minLines={showNextMatchDay ? 3 : undefined}>
      {t('hub.leagueFilterEmpty')}{' '}
      <button type="button" className={styles.emptyAction} onClick={() => leagueFilter.selectMode('all')}>
        {t('hub.showAll')}
      </button>
      {showNextMatchDay ? (
        <NextMatchDayNotice from={selectedDate} leagueIds={activeCompetitionIds(leagueFilter.state)} onGoToDate={setSelectedDate} />
      ) : null}
    </EmptyState>
  ) : showNextMatchDay && grouped.length === 0 ? (
    <EmptyState minLines={2}>
      {t('list.empty')}
      <NextMatchDayNotice from={selectedDate} leagueIds={null} onGoToDate={setSelectedDate} />
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
        fill={showDetailPanel || showGundemPanel}
        // Dar görünümde içerik kadar; ≥ split CSS'le sabit yüksekliğe döner (JS ölçümü beklenmez → SSR = istemci).
        fitContent="belowSplit"
      />
    </>
  );

  return (
    <>
      <SubHeader
        initialTodayIso={initialDate}
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
            showGundemPanel ? styles.hubGridWithGundem : '',
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
                    selectedSeasonId={effectiveSeasonId}
                    onSeasonChange={handleSeasonChange}
                    loadingRows={standingsLoadingRows}
                  />
                )}

                {sidebarTab === 'scorers' && (
                  <MatchCompetitionTopScorers
                    data={topScorers}
                    loading={topScorersLoading}
                    seasons={seasons}
                    selectedSeasonId={effectiveSeasonId}
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
                            <span>{leagueDisplayName(league, tl)}</span>
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
              {delayedNote}
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
                {/* Detay paneli ↔ Gündem geçişinde yeniden mount olur: 60 sn staleTime tüm yüklü sayfaların (infinite query)
                    her geçişte yeniden çekilmesini önler. Kendi post/beğeni/silme invalidation'ı staleTime'dan bağımsız. */}
                <HomeGundemPanel staleTime={60_000} onOpenPost={(postId) => void router.push(`/gundem/${postId}`)} />
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
