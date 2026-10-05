import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
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
import MatchList, { type MatchListDateGroup, type MatchListTrailingSection } from '@/components/MatchList';
import { MatchListSkeleton, PanelSkeleton } from '@/components/Skeleton';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchCompetitionTopScorers from '@/components/MatchCompetitionTopScorers';
import SubHeader, { type MatchTab } from '@/components/SubHeader';
import { isUefaCupCompetitionId, type SidebarLeague } from '@/config/leagues';
import { resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';
import { hubSelectionIdForLeague, sportmonksLeagueIdOfHubSelection } from '@/utils/hubLeagueSelection';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { parseLeagueImagePath, sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { readStoredHubLeague, storeHubLeague } from '@/utils/hubLeaguePreference';
import HubLeaguePicker from '@/components/HubLeaguePicker';
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
import { GUNDEM_PANEL_MIN_WIDTH, useMinWidth, useSplitView } from '@/hooks/useSplitView';
import { resolveHubSidePanel } from '@/utils/hubSidePanel';
import LeagueFilterBar from '@/components/LeagueFilterBar';
import LiveStrip from '@/components/LiveStrip';
import { selectLiveStripMatches } from '@/utils/liveStrip';
import { hubSectionToScroll } from '@/utils/hubNavScroll';
import AdSlot from '@/components/AdSlot';
import EmptyState from '@/components/EmptyState';
import { useLeagueFilter } from '@/hooks/useLeagueFilter';
import { useTopScorersWithAppearances } from '@/hooks/useTopScorerAppearances';
import { activeCompetitionIds, buildLeagueCatalog, filterMatchesByLeagues } from '@/utils/leagueFilter';
import { nightDateOf } from '@/utils/nightMatches';
import { buildNightGroups } from './nightSection';
import styles from '@/pages/index.module.scss';
import { HUB_TAB_BOOT_SCRIPT, clearHubTabBoot } from '@/utils/hubTabBoot';
import { clearHubLeagueBoot, hubLeagueBootScript } from '@/utils/hubLeagueBoot';

const noopSubscribe = () => () => {};

type SidebarTab = 'standings' | 'scorers';
const SIDEBAR_TABS: SidebarTab[] = ['standings', 'scorers'];

/**
 * Yalnızca geniş ekranda (split ≥ 1200 / Gündem ≥ 1440) görünen paneller ayrı chunk: mobil hiç indirmez.
 * Sunucuda çizilmez (görünürlükleri mount'ta ölçülen genişliğe bağlı); split açılınca boşta önceden yüklenir.
 */
const loadMatchDetailPanel = () => import('@/components/MatchDetailPanel');
const loadTeamDetailPanel = () => import('@/components/TeamDetailPanel');
const panelLoading = () => <PanelSkeleton rows={6} />;
const MatchDetailPanel = dynamic(loadMatchDetailPanel, { ssr: false, loading: panelLoading });
const TeamDetailPanel = dynamic(loadTeamDetailPanel, { ssr: false, loading: panelLoading });
const HomeGundemPanel = dynamic(() => import('@/components/HomeGundemPanel'), { ssr: false, loading: panelLoading });
/** Ligler sekmesi (34 lig + arama) yalnız sekme açılınca gerekir → ilk yük parçalarına girmez. */
const HubLeagueList = dynamic(() => import('@/components/HubLeagueList'), { ssr: false, loading: panelLoading });

/** Satır hover/focus'unda detay verisini ısıtır — modülü de yalnız split-view'da (ilk hover'da) yükler. */
function prefetchMatchDetailLazy(matchId: string): void {
  void import('@/hooks/useMatchDetail').then((m) => m.prefetchMatchDetail(matchId));
}

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
const EMPTY_MATCHES: Match[] = [];

/** "2026-10-03" → "3 Ekim" / "3 October" (gün takvim günü; saat dilimi kaydırması yok). */
function formatDayMonth(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

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

  // Yan panel: üstte lig seçici (seçili lig her iki sekmenin de ligi), altında Puan Durumu | Gol Krallığı.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('standings');
  const [pickerOpen, setPickerOpen] = useState(false);
  // Hatırlanan lig: hydration'da sunucu HTML'iyle aynı (varsayılan) başlar, aşağıdaki mount etkisi uygular (ön-boyama
  // betiği o arada yanlış lig adını gizler — utils/hubLeagueBoot.ts). İstemci tarafı geçişte (hydration yok) ilk
  // render'da doğrudan kayıtlı lig: `useSyncExternalStore` hydration'da sunucu değerini (false), sonra istemciyi verir.
  const isClientRender = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const restorableLeague = (id: number) =>
    !isUefaCupCompetitionId(id) &&
    (sidebarLeagues.some((l) => l.id === id) || HUB_LEAGUE_IDS.some((lid) => hubSelectionIdForLeague(lid) === id));
  const [initialStored] = useState(() => (isClientRender ? readStoredHubLeague(restorableLeague) : null));
  const [selectedCompId, setSelectedCompId] = useState(initialStored?.id ?? defaultCompetitionId);
  // Ön-boyamanın beklediği lig (mount etkisi seçince öznitelik kalkar)
  const pendingLeagueRef = useRef<number | null>(null);
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
  const [standingsRowsSeen, setStandingsRowsSeen] = useState<Record<number, number>>(() =>
    initialStored?.rows ? { [initialStored.id]: initialStored.rows } : {},
  );
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

  // Yan panel sezon seçicisi lig satırında: değişince tablo kutusunda karıştırma animasyonu (standings `seasonBusy`).
  const [seasonBusy, setSeasonBusy] = useState(false);
  const handleSeasonPick = useCallback(
    (seasonId: number) => {
      setSeasonBusy(true);
      handleSeasonChange(seasonId).then(
        () => setSeasonBusy(false),
        () => setSeasonBusy(false),
      );
    },
    [handleSeasonChange],
  );

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

  // Veri yokken sabit boş dizi: `?? []` her render'da yeni dizi verip memo'ları boşa yeniden hesaplatıyordu.
  const allMatches = homeMatchesQuery.data?.allMatches ?? EMPTY_MATCHES;
  const liveMatches = homeMatchesQuery.data?.liveMatches ?? EMPTY_MATCHES;
  const fixtureMatches = homeMatchesQuery.data?.fixtureMatches ?? EMPTY_MATCHES;
  const nightMatches = homeMatchesQuery.data?.nightMatches ?? EMPTY_MATCHES;
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

  // Canlı maç şeridi: yeni istek yok — sayfanın mevcut canlı / fikstür verisinden (bkz. utils/liveStrip.ts).
  const liveStrip = useMemo(
    () =>
      selectLiveStripMatches({
        live: liveMatches,
        pool: [...allMatches, ...fixtureMatches],
        leagueFilter: leagueFilter.state,
        allowedCompetitionIds: competitionFilterSet,
        todayIso,
      }),
    [liveMatches, allMatches, fixtureMatches, leagueFilter.state, competitionFilterSet, todayIso],
  );

  const grouped = useMemo(() => {
    const raw = groupMatchesByLeague(filteredDisplayMatches);
    return activeTab === 'all' ? sortGroupedMatchesForAllTab(raw) : raw;
  }, [activeTab, filteredDisplayMatches]);

  // Gece maçları (ertesi TR günü 00:00–06:00) — filtre/canlı birleştirme kuralları `buildNightGroups`'ta.
  const nightDate = nightDateOf(selectedDate);
  const nightGrouped = useMemo(
    () =>
      buildNightGroups({
        selectedDate,
        nightMatches,
        liveMatches,
        activeTab,
        favoriteTeamIds: favoriteTeamSet,
        shownIds: new Set(filteredDisplayMatches.map((m) => Number(m.id))),
        competitionFilter: competitionFilterSet,
        leagueFilter: leagueFilter.state,
      }),
    [selectedDate, nightMatches, liveMatches, activeTab, favoriteTeamSet, filteredDisplayMatches, competitionFilterSet, leagueFilter.state],
  );

  const nightSection = useMemo<MatchListTrailingSection | null>(
    () =>
      nightGrouped.length === 0
        ? null
        : {
            date: nightDate,
            label: t('hub.nightSection', { date: formatDayMonth(nightDate, locale) }),
            groupedMatches: nightGrouped,
          },
    [nightGrouped, nightDate, t, locale],
  );
  const listEmpty = grouped.length === 0 && nightGrouped.length === 0;

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
  // eşleme yoksa (ör. Sportmonks kapalı) config'in kısa adı. Negatif id = legacy eşlemesi olmayan plan ligi.
  const selectedLeagueName = selectedLeague
    ? leagueNameById(resolveSportmonksLeagueId(selectedLeague.id), leagueDisplayName(selectedLeague, tl), tl)
    : selectedCompId < 0
      ? leagueNameById(sportmonksLeagueIdOfHubSelection(selectedCompId), tl('fallback'), tl)
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

  // Lig seçici düğmesinin logosu: fikstürdeki görsel → config logosu → deterministik CDN yolu (liste satırlarıyla aynı).
  const selectedSportmonksLeagueId = sportmonksLeagueIdOfHubSelection(selectedCompId);
  const selectedLeagueLogo =
    (selectedSportmonksLeagueId != null ? parseLeagueImagePath(apiLogoBySportmonksLeagueId.get(selectedSportmonksLeagueId)) : null) ??
    selectedLeague?.logo ??
    (selectedSportmonksLeagueId != null ? sportmonksLeagueLogoUrl(selectedSportmonksLeagueId) : null);

  // Lig seçici rozeti: ekrandaki günün maç sayısı (Sportmonks league_id → sayı), mevcut veriden.
  const matchCountByLeague = useMemo(() => {
    const ids = new Set<number>();
    const counts = new Map<number, number>();
    for (const m of fixtureMatches) {
      const id = Number(m.id);
      const league = m.competition?.id;
      if (league == null || ids.has(id)) continue;
      ids.add(id);
      counts.set(league, (counts.get(league) ?? 0) + 1);
    }
    return counts;
  }, [fixtureMatches]);

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

  /** Lig seçiciyi kapatır; alt menüden (`?panel=leagues`) açıldıysa param da temizlenir. */
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    if (parseSidebarTab(queryRef.current[SIDEBAR_PANEL_QUERY]) === 'leagues') replaceQuery({ [SIDEBAR_PANEL_QUERY]: null });
  }, [replaceQuery]);

  const queryTab = router.query[MATCH_TAB_QUERY];
  const queryPanel = router.query[SIDEBAR_PANEL_QUERY];
  const queryLeague = router.query.league;
  const prevNavKey = useRef<string | null>(null);
  /** Sayfa içi durum çipinden gelen `?tab` değişikliği: mobilde listeye kaydırma yapılmaz (yalnız alt menü). */
  const tabFromChipRef = useRef(false);

  // Hydration `?tab`'ı uyguladı → ön-boyama özniteliği kalkar (CSS'in seçili gösterdiği sekme artık React'te).
  useEffect(() => {
    clearHubTabBoot(activeTab, document.documentElement);
  }, [activeTab]);

  useEffect(() => {
    if (!router.isReady) return;
    setActiveTab(parseMatchTab(queryTab) ?? 'all');
    // `?panel=leagues` (mobil alt menü "Ligler"): lig seçici açılır (sekme değişmez); diğerleri sekme.
    const panel = parseSidebarTab(queryPanel);
    setPickerOpen(panel === 'leagues');
    if (panel !== 'leagues') setSidebarTab(panel === 'scorers' ? 'scorers' : 'standings');

    // Mobil alt navigasyon: ilgili bölüme kaydır (yalnızca param DEĞİŞTİĞİNDE; durum çiplerinden değil)
    const navKey = `${String(queryTab ?? '')}|${String(queryPanel ?? '')}`;
    const targetId = hubSectionToScroll({
      prevKey: prevNavKey.current,
      nextKey: navKey,
      isMobile: window.matchMedia(MOBILE_LAYOUT_QUERY).matches,
      fromInPageControl: tabFromChipRef.current,
      hasPanel: Boolean(queryPanel),
    });
    if (targetId) document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    tabFromChipRef.current = false;
    prevNavKey.current = navKey;
  }, [router.isReady, queryTab, queryPanel]);

  // Header aramasından gelen `?league=<id>` — ligi seç, param'ı temizle
  useEffect(() => {
    if (!router.isReady || queryLeague == null) return;
    const id = Number(Array.isArray(queryLeague) ? queryLeague[0] : queryLeague);
    if (Number.isFinite(id) && sidebarLeagues.some((l) => l.id === id)) {
      setSelectedCompId(id);
      setSidebarTab('standings');
      storeHubLeague({ id, rows: null });
      // Aramadan gelen lig hatırlananın önüne geçer: ön-boyama beklemesi biter.
      pendingLeagueRef.current = null;
      clearHubLeagueBoot(document.documentElement);
    }
    replaceQuery({ league: null });
  }, [router.isReady, queryLeague, sidebarLeagues, replaceQuery]);

  // Hatırlanan lig (localStorage): sunucu HTML'i varsayılan ligle gelir, hatırlanan lig mount'ta uygulanır. İskelet o
  // ligin son görülen satır sayısıyla çizilir (tablo gelince kayma yok). UEFA kupaları geri yüklenmez: maç listesini
  // fikstür moduna çevirip sayfa açılışında büyük kayma yapardı (kupa seçimi o oturumla sınırlı).
  // Header aramasından `?league=` geldiyse o öncelikli (aşağıdaki etki uygular).
  useEffect(() => {
    const stored = router.query.league != null ? null : readStoredHubLeague(restorableLeague);
    if (!stored || stored.id === selectedCompId) {
      // Uygulanacak bir şey yok (kayıt yok / geçersiz / istemci geçişinde zaten seçili): ön-boyama hemen kalkar.
      clearHubLeagueBoot(document.documentElement);
      return;
    }
    // localStorage yalnız istemcide: mount'ta bir kez (hydration ile uyumlu, kalıp yukarıdaki "bugün" düzeltmesiyle aynı).
    pendingLeagueRef.current = stored.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored.rows) setStandingsRowsSeen((prev) => ({ ...prev, [stored.id]: stored.rows! }));
    setSelectedCompId(stored.id);
    // Yalnız mount'ta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hatırlanan lig seçildi → ön-boyama özniteliği kalkar, doğru ad görünür (mount'ta seçim henüz varsayılan: beklenir).
  useEffect(() => {
    if (pendingLeagueRef.current == null || pendingLeagueRef.current !== selectedCompId) return;
    pendingLeagueRef.current = null;
    clearHubLeagueBoot(document.documentElement);
  }, [selectedCompId]);

  // Hatırlanan ligin satır sayısı güncel kalsın (yalnız kayıtlı lig seçiliyken; varsayılanı kendiliğinden yazmaz).
  useEffect(() => {
    const rows = standingsRowsSeen[selectedCompId];
    if (!rows) return;
    const cur = readStoredHubLeague(() => true);
    if (cur?.id === selectedCompId && cur.rows !== rows) storeHubLeague({ id: selectedCompId, rows });
  }, [selectedCompId, standingsRowsSeen]);

  // Split açıldıysa detay panellerinin kodunu boşta önceden indir (ilk tıklamada bekleme olmasın).
  useEffect(() => {
    if (!isSplit) return;
    const run = () => {
      void loadMatchDetailPanel();
      void loadTeamDetailPanel();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1500);
    return () => window.clearTimeout(id);
  }, [isSplit]);

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
    storeHubLeague({ id: competitionId, rows: standingsRowsSeen[competitionId] ?? null });
    closePicker();
  }

  function exitFixtureMode() {
    setSelectedCompId(defaultCompetitionId);
    storeHubLeague({ id: defaultCompetitionId, rows: standingsRowsSeen[defaultCompetitionId] ?? null });
  }

  // Sekmeler: ← / → ile geçiş (WAI-ARIA tab kalıbı; odak yeni sekmeye).
  const onSidebarTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = SIDEBAR_TABS[(SIDEBAR_TABS.indexOf(sidebarTab) + 1) % SIDEBAR_TABS.length]!;
    handleSidebarTabChange(next);
    document.getElementById(`hub-sidebar-tab-${next}`)?.focus();
  };

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
        onPrefetchMatch={isSplit ? prefetchMatchDetailLazy : undefined}
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
  ) : leagueFilterActive && listEmpty ? (
    <EmptyState minLines={showNextMatchDay ? 3 : undefined}>
      {t('hub.leagueFilterEmpty')}{' '}
      <button type="button" className={styles.emptyAction} onClick={() => leagueFilter.selectMode('all')}>
        {t('hub.showAll')}
      </button>
      {showNextMatchDay ? (
        <NextMatchDayNotice from={selectedDate} leagueIds={activeCompetitionIds(leagueFilter.state)} onGoToDate={setSelectedDate} />
      ) : null}
    </EmptyState>
  ) : showNextMatchDay && listEmpty ? (
    <EmptyState minLines={2}>
      {t('list.empty')}
      <NextMatchDayNotice from={selectedDate} leagueIds={null} onGoToDate={setSelectedDate} />
    </EmptyState>
  ) : (
    <>
      <MatchList
        groupedMatches={grouped}
        trailingSection={nightSection}
        favoriteTeamIds={favoriteTeamSet}
        onToggleFavorite={toggleFavoriteTeam}
        // Split-view yalnızca masaüstünde; mobilde tam sayfa (push) navigasyon korunur.
        onSelectMatch={isSplit ? handleSelectMatch : undefined}
        onPrefetchMatch={isSplit ? prefetchMatchDetailLazy : undefined}
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
      {/* Hatırlanan lig sunucuda bilinmez: boyamadan önce <html data-hub-league-pending> (bkz. utils/hubLeagueBoot.ts). */}
      <script dangerouslySetInnerHTML={{ __html: hubLeagueBootScript(defaultCompetitionId) }} />
      {/* `?tab=` sunucuda bilinmez (ISR): boyamadan önce <html data-hub-tab> (bkz. utils/hubTabBoot.ts). */}
      <script dangerouslySetInnerHTML={{ __html: HUB_TAB_BOOT_SCRIPT }} />
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
          <div className={styles.leagueBarChips}>
          <LeagueFilterBar
            state={leagueFilter.state}
            catalog={leagueCatalog}
            onSelectMode={leagueFilter.selectMode}
            onApplyCustom={leagueFilter.applyCustom}
            leading={
              <MatchStatusChips
                activeTab={activeTab}
                liveCount={liveMatches.length}
                onToggle={(tab) => {
                  tabFromChipRef.current = true;
                  handleTabChange(activeTab === tab ? 'all' : tab);
                }}
              />
            }
          />
          </div>
          {/* Alan her zaman çizilir (sabit yükseklik); maç yoksa boş kalır → şerit gelip gidince kayma yok. */}
          <div className={styles.liveStripSlot}>
            {liveStrip ? (
              <LiveStrip
                matches={liveStrip.matches}
                bigIds={liveStrip.bigIds}
                todayIso={todayIso}
                onSelectMatch={isSplit ? handleSelectMatch : undefined}
                onPrefetchMatch={isSplit ? prefetchMatchDetailLazy : undefined}
              />
            ) : null}
          </div>
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
              <HubLeaguePicker
                open={pickerOpen}
                onOpenChange={(open) => (open ? setPickerOpen(true) : closePicker())}
                leagueName={selectedLeagueName}
                logoSrc={selectedLeagueLogo}
                logoBackdrop={selectedSportmonksLeagueId != null && competitionLogoNeedsBackdrop(selectedSportmonksLeagueId)}
                seasons={seasons}
                selectedSeasonId={effectiveSeasonId}
                onSeasonChange={handleSeasonPick}
                seasonsLoading={sidebarQueryLoading}
              >
                <HubLeagueList
                  selectedId={selectedCompId}
                  onSelect={handleLeagueClick}
                  matchCountByLeague={matchCountByLeague}
                  apiLogoByLeague={apiLogoBySportmonksLeagueId}
                  // Masaüstünde açılınca aramaya odak; mobilde klavye açılıp listeyi örtmesin
                  autoFocusSearch={pickerOpen && !window.matchMedia(MOBILE_LAYOUT_QUERY).matches}
                />
              </HubLeaguePicker>

              {pickerOpen ? null : (
                <>
                  <div className={styles.sidebarTabs} role="tablist" aria-label={selectedLeagueName}>
                    {SIDEBAR_TABS.map((tab) => (
                      <button
                        key={tab}
                        id={`hub-sidebar-tab-${tab}`}
                        type="button"
                        role="tab"
                        aria-selected={sidebarTab === tab}
                        aria-controls="hub-sidebar-panel"
                        tabIndex={sidebarTab === tab ? 0 : -1}
                        className={`${styles.sidebarTab} ${sidebarTab === tab ? styles.sidebarTabActive : ''}`}
                        onClick={() => handleSidebarTabChange(tab)}
                        onKeyDown={onSidebarTabKeyDown}
                      >
                        {t(tab === 'standings' ? 'hub.tabStandings' : 'hub.tabScorers')}
                      </button>
                    ))}
                  </div>

                  <div id="hub-sidebar-panel" role="tabpanel" aria-labelledby={`hub-sidebar-tab-${sidebarTab}`} className={styles.sidebarContent}>
                    {sidebarTab === 'standings' && (
                      <MatchCompetitionStandings
                        data={standings}
                        loading={standingsLoading}
                        competitionName={selectedLeagueName}
                        loadingRows={standingsLoadingRows}
                        hideHeader
                        seasonBusy={seasonBusy}
                      />
                    )}

                    {sidebarTab === 'scorers' && (
                      <MatchCompetitionTopScorers
                        data={topScorers}
                        loading={topScorersLoading}
                        hideHeader
                      />
                    )}
                  </div>
                </>
              )}
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
                    onClick={exitFixtureMode}
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

const STATUS_CHIPS: { tab: Exclude<MatchTab, 'all'>; labelKey: string }[] = [
  { tab: 'live', labelKey: 'subHeader.live' },
  { tab: 'favorites', labelKey: 'subHeader.favorites' },
  { tab: 'finished', labelKey: 'subHeader.finished' },
];

/**
 * Mobil (< 1024 px): maç durumu çipleri lig çipleriyle aynı kaydırmalı satırda — Canlı (sayıyla) · Favoriler ·
 * Bitmiş · ayraç. Tek seçimli aç/kapa: seçili çipe tekrar dokununca "Hepsi" (`?tab=` davranışı aynı). Canlı sayısı
 * rozetinin yeri hep ayrılı (sayı sonradan gelse ya da 0 olsa da çip genişliği zıplamaz). Masaüstünde gizli
 * (orada SubHeader sekmeleri).
 */
function MatchStatusChips({
  activeTab,
  liveCount,
  onToggle,
}: {
  activeTab: MatchTab;
  liveCount: number;
  onToggle: (tab: Exclude<MatchTab, 'all'>) => void;
}) {
  const { t } = useTranslation('match');
  return (
    <span className={styles.statusChips} role="group" aria-label={t('subHeader.matchFilter')}>
      {STATUS_CHIPS.map(({ tab, labelKey }) => (
        <button
          key={tab}
          type="button"
          className={`${styles.statusChip} ${activeTab === tab ? styles.statusChipActive : ''}`.trim()}
          data-tab={tab}
          aria-pressed={activeTab === tab}
          onClick={() => onToggle(tab)}
        >
          {t(labelKey)}
          {tab === 'live' ? (
            <span className={styles.statusCount} aria-hidden={liveCount === 0} data-empty={liveCount === 0 || undefined}>
              {liveCount > 0 ? liveCount : ''}
            </span>
          ) : null}
        </button>
      ))}
      <span className={styles.statusDivider} aria-hidden="true" />
    </span>
  );
}
