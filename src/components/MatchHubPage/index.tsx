import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAllCompetitionHistoryMatches,
  getAllLiveMatches,
  getAllMatchesByDate,
  getFixturesByCompetition,
  getFixturesByDate,
  groupMatchesByLeague,
  mergeMatchesForAllTab,
  sortGroupedMatchesForAllTab,
  getCompetitionTableFull,
  getSeasonsList,
  getTopScorers,
  type CompetitionTableData,
  type SeasonListItem,
  type TopScorersPayload,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import type { NewsItem } from '@/models/domain';
import MatchList from '@/components/MatchList';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchCompetitionTopScorers from '@/components/MatchCompetitionTopScorers';
import NewsList from '@/components/NewsList';
import SubHeader, { type MatchTab } from '@/components/SubHeader';
import Container from '@/components/Container';
import UefaKnockoutBracket from '@/components/UefaKnockoutBracket';
import type { SidebarLeague } from '@/config/leagues';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';
import { getNews } from '@/services/newsApi';
import {
  buildBracketRounds,
  mergeUefaCompetitionMatches,
  sortMatchesForUefaList,
} from '@/utils/uefaBracket';
import styles from '@/pages/index.module.scss';
import type { MatchHubHomeInitialServerPayload } from '@/types/matchHubHomeSsr';
import type { UefaHubInitialServerPayload } from '@/types/uefaHubSsr';

type SidebarTab = 'standings' | 'leagues' | 'news';
export type MatchHubMode = 'default' | 'uefa';

export type MatchHubPageProps = {
  sidebarLeagues: SidebarLeague[];
  defaultCompetitionId: number;
  /** Doluysa maç listesi yalnızca bu `competition_id` değerleriyle sınırlı */
  allowedCompetitionIds: number[] | null;
  /** `uefa`: seçili lige göre fikstür + geçmiş + canlı + eleme braketi */
  mode?: MatchHubMode;
  /** `/uefa` için `getServerSideProps` ile gelen ilk paket (yalnızca `mode="uefa"`) */
  initialUefaHubData?: UefaHubInitialServerPayload | null;
  /** `/` için SSR ilk paket (yalnızca `mode="default"`) */
  initialDefaultHubData?: MatchHubHomeInitialServerPayload | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function MatchHubPage({
  sidebarLeagues,
  defaultCompetitionId,
  allowedCompetitionIds,
  mode = 'default',
  initialUefaHubData = null,
  initialDefaultHubData = null,
}: MatchHubPageProps) {
  const isUefaMode = mode === 'uefa';
  const hasUefaSsr = Boolean(isUefaMode && initialUefaHubData);
  const hasDefaultSsr = Boolean(!isUefaMode && initialDefaultHubData);

  const [allMatches, setAllMatches] = useState<Match[]>(() =>
    !isUefaMode && initialDefaultHubData ? initialDefaultHubData.allMatches : []
  );
  const [liveMatches, setLiveMatches] = useState<Match[]>(() =>
    isUefaMode
      ? (initialUefaHubData?.liveMatches ?? [])
      : (initialDefaultHubData?.liveMatches ?? [])
  );
  const [fixtureMatches, setFixtureMatches] = useState<Match[]>(() =>
    !isUefaMode && initialDefaultHubData ? initialDefaultHubData.fixtureMatches : []
  );
  const [uefaHistory, setUefaHistory] = useState<Match[]>(
    () => initialUefaHubData?.uefaHistory ?? []
  );
  const [uefaCompFixtures, setUefaCompFixtures] = useState<Match[]>(
    () => initialUefaHubData?.uefaCompFixtures ?? []
  );
  const [loading, setLoading] = useState(() => !hasUefaSsr && !hasDefaultSsr);
  const [selectedDate, setSelectedDate] = useState<string>(
    () => initialDefaultHubData?.selectedDate ?? today()
  );
  const [activeTab, setActiveTab] = useState<MatchTab>('all');

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('leagues');
  const [selectedCompId, setSelectedCompId] = useState(defaultCompetitionId);
  const [standings, setStandings] = useState<CompetitionTableData | null>(() =>
    isUefaMode
      ? (initialUefaHubData?.standings ?? null)
      : (initialDefaultHubData?.standings ?? null)
  );
  const [standingsLoading, setStandingsLoading] = useState(
    () => !hasUefaSsr && !hasDefaultSsr
  );
  const [topScorers, setTopScorers] = useState<TopScorersPayload | null>(() =>
    isUefaMode
      ? (initialUefaHubData?.topScorers ?? null)
      : (initialDefaultHubData?.topScorers ?? null)
  );
  const [topScorersLoading, setTopScorersLoading] = useState(
    () => !hasUefaSsr && !hasDefaultSsr
  );
  const [seasons, setSeasons] = useState<SeasonListItem[]>(() =>
    isUefaMode
      ? (initialUefaHubData?.seasons ?? [])
      : (initialDefaultHubData?.seasons ?? [])
  );
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(() =>
    isUefaMode
      ? (initialUefaHubData?.selectedSeasonId ?? null)
      : (initialDefaultHubData?.selectedSeasonId ?? null)
  );

  /** SSR sonrası ilk gereksiz client fetch’lerini atlamak */
  const ssrSkipConsumed = useRef({
    uefaMatches: false,
    uefaStandings: false,
    defaultMatches: false,
    defaultStandings: false,
  });

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    if (isUefaMode) {
      const compId = String(selectedCompId);
      const [liveAll, compFixtures, compHistory] = await Promise.all([
        getAllLiveMatches(),
        getFixturesByCompetition(compId),
        getAllCompetitionHistoryMatches(compId, { maxPages: 4 }),
      ]);
      setLiveMatches(liveAll);
      setUefaCompFixtures(compFixtures);
      setUefaHistory(compHistory);
      setAllMatches([]);
      setFixtureMatches([]);
    } else {
      const [historyAll, liveAll, fixtures] = await Promise.all([
        getAllMatchesByDate(selectedDate),
        getAllLiveMatches(),
        getFixturesByDate(selectedDate),
      ]);
      setAllMatches(historyAll);
      setLiveMatches(liveAll);
      setFixtureMatches(fixtures);
    }
    setLoading(false);
  }, [isUefaMode, selectedCompId, selectedDate]);

  useEffect(() => {
    const uefaCompId = initialUefaHubData?.competitionId;
    const canSkipUefaMatches =
      isUefaMode &&
      initialUefaHubData &&
      uefaCompId != null &&
      selectedCompId === uefaCompId &&
      !ssrSkipConsumed.current.uefaMatches;

    const canSkipDefaultMatches =
      !isUefaMode &&
      initialDefaultHubData &&
      selectedDate === initialDefaultHubData.selectedDate &&
      selectedCompId === initialDefaultHubData.competitionId &&
      !ssrSkipConsumed.current.defaultMatches;

    if (canSkipUefaMatches) {
      ssrSkipConsumed.current.uefaMatches = true;
    } else if (canSkipDefaultMatches) {
      ssrSkipConsumed.current.defaultMatches = true;
    } else {
      queueMicrotask(() => {
        void fetchData();
      });
    }

    const interval = setInterval(async () => {
      if (isUefaMode) {
        const compId = String(selectedCompId);
        const [liveAll, compFixtures] = await Promise.all([
          getAllLiveMatches(),
          getFixturesByCompetition(compId),
        ]);
        setLiveMatches(liveAll);
        setUefaCompFixtures(compFixtures);
      } else {
        const [liveAll, fixtures] = await Promise.all([
          getAllLiveMatches(),
          getFixturesByDate(selectedDate),
        ]);
        setLiveMatches(liveAll);
        setFixtureMatches(fixtures);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [
    fetchData,
    isUefaMode,
    selectedCompId,
    selectedDate,
    initialUefaHubData,
    initialDefaultHubData,
  ]);

  const handleSeasonChange = useCallback(
    async (seasonId: number) => {
      const compId = String(selectedCompId);
      setSelectedSeasonId(seasonId);
      setStandingsLoading(true);
      setTopScorersLoading(true);
      const [tableData, scorersData] = await Promise.all([
        getCompetitionTableFull(compId, { season: seasonId }),
        getTopScorers(compId, { season: seasonId }),
      ]);
      setStandings(tableData);
      setTopScorers(scorersData);
      setStandingsLoading(false);
      setTopScorersLoading(false);
    },
    [selectedCompId]
  );

  useEffect(() => {
    const uefaCompId = initialUefaHubData?.competitionId;
    const canSkipUefaStandings =
      isUefaMode &&
      initialUefaHubData &&
      uefaCompId != null &&
      selectedCompId === uefaCompId &&
      !ssrSkipConsumed.current.uefaStandings;

    const canSkipDefaultStandings =
      !isUefaMode &&
      initialDefaultHubData &&
      selectedCompId === initialDefaultHubData.competitionId &&
      !ssrSkipConsumed.current.defaultStandings;

    if (canSkipUefaStandings) {
      ssrSkipConsumed.current.uefaStandings = true;
      return;
    }
    if (canSkipDefaultStandings) {
      ssrSkipConsumed.current.defaultStandings = true;
      return;
    }

    let cancelled = false;
    const compId = String(selectedCompId);

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setStandingsLoading(true);
      setTopScorersLoading(true);

      const [seasonsList, table1] = await Promise.all([
        getSeasonsList(),
        getCompetitionTableFull(compId),
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
        tableFinal = await getCompetitionTableFull(compId, { season: sid });
      }
      if (cancelled) return;

      const scorersData = await getTopScorers(
        compId,
        sid != null ? { season: sid } : undefined
      );
      if (cancelled) return;

      setStandings(tableFinal ?? table1);
      setTopScorers(scorersData);
      setStandingsLoading(false);
      setTopScorersLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompId, isUefaMode, initialUefaHubData, initialDefaultHubData]);

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

  const uefaMerged = useMemo(() => {
    if (!isUefaMode) return [] as Match[];
    return mergeUefaCompetitionMatches({
      competitionId: selectedCompId,
      liveAll: liveMatches,
      fixtures: uefaCompFixtures,
      history: uefaHistory,
    });
  }, [isUefaMode, selectedCompId, liveMatches, uefaCompFixtures, uefaHistory]);

  const uefaBracketRounds = useMemo(() => {
    if (!isUefaMode) return [];
    return buildBracketRounds(uefaMerged);
  }, [isUefaMode, uefaMerged]);

  const displayMatches = useMemo(() => {
    if (isUefaMode) {
      switch (activeTab) {
        case 'live':
          return uefaMerged.filter(
            (m) => m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK'
          );
        case 'finished':
          return uefaMerged.filter((m) => m.status === 'FINISHED');
        case 'favorites':
          return [];
        case 'all':
        default:
          return sortMatchesForUefaList(uefaMerged);
      }
    }
    switch (activeTab) {
      case 'live':
        return liveMatches.filter(
          (m) => m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK'
        );
      case 'finished':
        return allMatches.filter((m) => m.status === 'FINISHED');
      case 'favorites':
        return [];
      case 'all':
      default:
        return mergeMatchesForAllTab({
          selectedDate,
          historyPageMatches: allMatches,
          liveMatches,
          fixtures: fixtureMatches,
        });
    }
  }, [
    isUefaMode,
    uefaMerged,
    activeTab,
    allMatches,
    liveMatches,
    fixtureMatches,
    selectedDate,
  ]);

  const competitionFilterSet = useMemo(() => {
    if (!allowedCompetitionIds?.length) return null;
    return new Set(allowedCompetitionIds);
  }, [allowedCompetitionIds]);

  const filteredDisplayMatches = useMemo(() => {
    if (isUefaMode) {
      return displayMatches.filter((m) => m.competition?.id === selectedCompId);
    }
    if (!competitionFilterSet) return displayMatches;
    return displayMatches.filter((m) =>
      competitionFilterSet.has(m.competition?.id ?? 0)
    );
  }, [isUefaMode, selectedCompId, displayMatches, competitionFilterSet]);

  const grouped = useMemo(() => {
    const raw = groupMatchesByLeague(filteredDisplayMatches);
    return activeTab === 'all' ? sortGroupedMatchesForAllTab(raw) : raw;
  }, [activeTab, filteredDisplayMatches]);

  const selectedLeagueName =
    sidebarLeagues.find((l) => l.id === selectedCompId)?.name ?? 'Lig';

  function handleLeagueClick(competitionId: number) {
    setSelectedCompId(competitionId);
    if (!isUefaMode) setSidebarTab('standings');
  }

  return (
    <>
      <SubHeader
        selectedDate={selectedDate}
        onDateChange={(d) => {
          setSelectedDate(d);
        }}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <Container>
        <div className="layout-split">
          <aside className="layout-right">
            <div className={styles.sidebar}>
              <nav className={styles.sidebarTabs}>
                <button
                  type="button"
                  className={`${styles.sidebarTab} ${sidebarTab === 'standings' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('standings')}
                >
                  Puan Durumu
                </button>
                <button
                  type="button"
                  className={`${styles.sidebarTab} ${sidebarTab === 'leagues' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('leagues')}
                >
                  Ligler
                </button>
                <button
                  type="button"
                  className={`${styles.sidebarTab} ${sidebarTab === 'news' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('news')}
                >
                  Haberler
                </button>
              </nav>

              <div className={styles.sidebarContent}>
                {sidebarTab === 'standings' && (
                  <>
                    <MatchCompetitionStandings
                      data={standings}
                      loading={standingsLoading}
                      competitionName={selectedLeagueName}
                      seasons={seasons}
                      selectedSeasonId={selectedSeasonId}
                      onSeasonChange={handleSeasonChange}
                    />
                    <MatchCompetitionTopScorers
                      data={topScorers}
                      loading={topScorersLoading}
                      seasons={seasons}
                      selectedSeasonId={selectedSeasonId}
                      onSeasonChange={handleSeasonChange}
                    />
                  </>
                )}

                {sidebarTab === 'leagues' && (
                  <ul className={styles.leagueList}>
                    {sidebarLeagues.map((league) => {
                      const logoUrl =
                        league.logo || uefaCompetitionLogoSrcById(league.id);
                      return (
                        <li key={league.id}>
                          <button
                            type="button"
                            className={`${styles.leagueItem} ${league.id === selectedCompId ? styles.leagueItemActive : ''}`}
                            onClick={() => handleLeagueClick(league.id)}
                          >
                            {logoUrl ? (
                              <img
                                src={logoUrl}
                                alt=""
                                className={styles.leagueFlag}
                                width={20}
                                height={20}
                              />
                            ) : league.countryId != null ? (
                              <img
                                src={countryFlagImgSrc(league.countryId)}
                                alt=""
                                className={styles.leagueFlag}
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
                )}

                {sidebarTab === 'news' && (
                  <NewsList items={newsItems} loading={newsLoading} />
                )}
              </div>
            </div>
          </aside>
          <div className="layout-left">
            {loading ? (
              <div className={styles.loading}>Yükleniyor...</div>
            ) : activeTab === 'favorites' ? (
              <div className={styles.empty}>
                Favori maçlarınız burada görünecek.
              </div>
            ) : (
              <>
                {isUefaMode && uefaBracketRounds.length > 0 ? (
                  <div className={styles.bracketWrap}>
                    <UefaKnockoutBracket
                      rounds={uefaBracketRounds}
                      competitionName={selectedLeagueName}
                    />
                  </div>
                ) : null}
                <MatchList
                  groupedMatches={grouped}
                  showDateWhenNotToday={isUefaMode}
                />
              </>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
