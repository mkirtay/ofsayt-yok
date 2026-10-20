import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/standings';
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Container from '@/components/Container';
import HubLeagueList from '@/components/HubLeagueList';
import HubLeaguePicker from '@/components/HubLeaguePicker';
import { standingsGroupHeading } from '@/components/MatchCompetitionStandings/groupHeading';
import LazyLoad from '@/components/LazyLoad';
import { StandingsSkeleton } from '@/components/Skeleton';
import { CardsList, ScorersList, StandingsTable, type StandingsBlock } from '@/components/StandingsView';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import {
  useStandingsCards,
  useStandingsScorers,
  useStandingsSeasons,
  useStandingsTable,
  useStandingsTeamOfTheWeek,
} from '@/hooks/useStandingsPage';
import type { CompetitionTableData } from '@/services/liveScoreService';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { readStoredHubLeague } from '@/utils/hubLeaguePreference';
import { hubSelectionIdForLeague, sportmonksLeagueIdOfHubSelection } from '@/utils/hubLeagueSelection';
import { leagueNameById } from '@/utils/leagueName';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import styles from './standings.module.scss';
import { siteBaseUrl } from '@/lib/siteUrl';

const DEFAULT_SELECTION_ID = 6; // Süper Lig (legacy id; bkz. utils/hubLeagueSelection.ts)
const CARDS_LIMIT = 50;
const TABS = ['table', 'scorers', 'cards', 'totw'] as const;
// Haftanın 11'i sahası ayrı parça: yalnız sekme açılınca yüklenir.
const loadTeamOfTheWeek = () => import('@/components/TeamOfTheWeek');
type Tab = (typeof TABS)[number];
const EMPTY_MAP: ReadonlyMap<number, number> = new Map();
const EMPTY_LOGOS: ReadonlyMap<number, string> = new Map();

const isAllowedSelection = (id: number) => HUB_LEAGUE_IDS.some((lid) => hubSelectionIdForLeague(lid) === id);

/** Tek tablo ya da aşama/grup blokları → çizilecek bloklar (çok gruplu liglerde her grup ayrı tablo). */
function toBlocks(data: CompetitionTableData | null | undefined, groupLabel: (name: string) => string): StandingsBlock[] {
  if (!data) return [];
  if (data.table?.length) return [{ key: 'all', rows: data.table }];
  const stages = data.stages ?? [];
  return stages.flatMap((s, si) =>
    (s.groups ?? [])
      .filter((g) => g.standings?.length)
      .map((g, gi) => ({
        key: `${si}-${g.id ?? gi}`,
        title: [stages.length > 1 ? s.stage?.name : undefined, g.name ? groupLabel(g.name) : undefined]
          .filter(Boolean)
          .join(' · ') || undefined,
        rows: g.standings!,
      })),
  );
}

export default function Standings() {
  const { t } = useTranslation('standings');
  const { t: tm } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const router = useRouter();

  const [selectedId, setSelectedId] = useState(DEFAULT_SELECTION_ID);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('table');
  const [pickerOpen, setPickerOpen] = useState(false);
  // Tercih (?league= ya da ana sayfada son seçilen lig) istemcide çözülür; çözülene kadar sorgu başlamaz
  // (varsayılan lig için boşuna istek atılıp sonra değişmesin).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const fromQuery = Number(router.query.league);
    const fromUrl = Number.isInteger(fromQuery) && fromQuery !== 0 && isAllowedSelection(fromQuery) ? fromQuery : null;
    const stored = fromUrl == null ? readStoredHubLeague(isAllowedSelection) : null;
    const next = fromUrl ?? stored?.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL / localStorage → durum (SSR'da okunamaz; hidrasyon farkı olmasın)
    if (next != null) setSelectedId(next);
    setReady(true);
  }, [router.isReady, router.query.league]);

  const seasonsQuery = useStandingsSeasons(selectedId, ready);
  const tableQuery = useStandingsTable(selectedId, seasonId, ready);
  const effectiveSeasonId = seasonId ?? tableQuery.data?.season?.id ?? null;
  const dataReady = ready && tableQuery.isFetched;
  const scorersQuery = useStandingsScorers(selectedId, effectiveSeasonId, dataReady && tab === 'scorers');
  const cardsQuery = useStandingsCards(selectedId, effectiveSeasonId, dataReady && tab === 'cards');
  // Haftanın 11'i tablo ile birlikte (CDN'li küçük yanıt): sekme yalnız veri varsa ve güncel sezonda görünür (ligde yoksa
  // hiç görünmez). Hata ≠ yok: sekme açıkken hata/yükleme sürerse sekme kalır, panel "yüklenemedi · tekrar dene".
  const totwQuery = useStandingsTeamOfTheWeek(selectedId, ready);
  const totw = totwQuery.data ?? null;
  const totwAvailable = totw != null && (seasonId == null || seasonId === totw.round.seasonId);
  const showTotwTab = totwAvailable || (tab === 'totw' && (totwQuery.isLoading || totwQuery.isError));
  const activeTab: Tab = tab === 'totw' && !showTotwTab ? 'table' : tab;
  const visibleTabs: readonly Tab[] = showTotwTab ? TABS : TABS.filter((id) => id !== 'totw');

  const sportmonksLeagueId = sportmonksLeagueIdOfHubSelection(selectedId);
  const leagueName = leagueNameById(sportmonksLeagueId, tl('fallback'), tl);
  const leagueLogo = sportmonksLeagueId != null ? sportmonksLeagueLogoUrl(sportmonksLeagueId) : null;

  const blocks = useMemo(
    () => toBlocks(tableQuery.data, (name) => standingsGroupHeading(name, tm)),
    [tableQuery.data, tm],
  );
  const scorers = scorersQuery.data?.topscorers ?? [];
  // Kartlar: önce sarı, eşitlikte kırmızı çoklu olan üstte; ilk 50 (166 satırlık DOM gereksiz).
  const cards = useMemo(
    () =>
      [...(cardsQuery.data ?? [])]
        .sort((a, b) => b.yellow_cards - a.yellow_cards || b.red_cards - a.red_cards)
        .slice(0, CARDS_LIMIT),
    [cardsQuery.data],
  );

  const active = { table: tableQuery, scorers: scorersQuery, cards: cardsQuery, totw: totwQuery }[activeTab];
  const loading =
    !ready ||
    (activeTab === 'table' ? tableQuery.isLoading : activeTab === 'totw' ? totwQuery.isLoading : !dataReady || active.isLoading);
  const isEmpty =
    activeTab === 'table'
      ? blocks.length === 0
      : activeTab === 'scorers'
        ? scorers.length === 0
        : activeTab === 'cards'
          ? cards.length === 0
          : !totwAvailable;

  const pickLeague = (id: number) => {
    setSelectedId(id);
    setSeasonId(null);
    setPickerOpen(false);
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : visibleTabs.length - 1;
    const next = visibleTabs[(visibleTabs.indexOf(activeTab) + step) % visibleTabs.length]!;
    setTab(next);
    document.getElementById(`standings-tab-${next}`)?.focus();
  };

  const tabLabel = { table: t('tabStandings'), scorers: t('tabScorers'), cards: t('tabCards'), totw: t('tabTotw') } as const;
  const origin = siteBaseUrl();

  return (
    <Container>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={`${origin}/standings`} />
        <link rel="canonical" href={`${origin}/standings`} />
      </Head>
      <div className={styles.pageHeader}>
        <h1>{t('heading')}</h1>
      </div>

      <div className={styles.card}>
        <HubLeaguePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          leagueName={leagueName}
          logoSrc={leagueLogo}
          logoBackdrop={sportmonksLeagueId != null && competitionLogoNeedsBackdrop(sportmonksLeagueId)}
          seasons={seasonsQuery.data}
          selectedSeasonId={effectiveSeasonId}
          onSeasonChange={setSeasonId}
          seasonsLoading={!ready || seasonsQuery.isLoading}
        >
          <HubLeagueList
            selectedId={selectedId}
            onSelect={pickLeague}
            matchCountByLeague={EMPTY_MAP}
            apiLogoByLeague={EMPTY_LOGOS}
            autoFocusSearch={pickerOpen}
          />
        </HubLeaguePicker>

        {pickerOpen ? null : (
          <>
            <div className={styles.tabs} role="tablist" aria-label={leagueName}>
              {visibleTabs.map((id) => (
                <button
                  key={id}
                  id={`standings-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  aria-controls="standings-panel"
                  tabIndex={activeTab === id ? 0 : -1}
                  className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`.trim()}
                  onClick={() => setTab(id)}
                  onKeyDown={onTabKeyDown}
                >
                  {tabLabel[id]}
                </button>
              ))}
            </div>

            <div id="standings-panel" role="tabpanel" aria-labelledby={`standings-tab-${activeTab}`} className={styles.panel}>
              {loading ? (
                <StandingsSkeleton rows={activeTab === 'table' ? 18 : 12} />
              ) : active.isError ? (
                <div className={styles.message}>
                  {t('loadError')}{' '}
                  <button type="button" onClick={() => void active.refetch()}>
                    {t('retry')}
                  </button>
                </div>
              ) : isEmpty ? (
                <div className={styles.message}>{t('noData')}</div>
              ) : activeTab === 'table' ? (
                <StandingsTable blocks={blocks} competitionId={tableQuery.data?.competition?.id} />
              ) : activeTab === 'scorers' ? (
                <ScorersList rows={scorers} />
              ) : activeTab === 'cards' ? (
                <CardsList rows={cards} />
              ) : (
                <LazyLoad load={loadTeamOfTheWeek} props={{ data: totw!, leagueName }} />
              )}
            </div>
          </>
        )}
      </div>
    </Container>
  );
}
