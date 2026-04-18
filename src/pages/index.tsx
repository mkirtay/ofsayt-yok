import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAllLiveMatches,
  getAllMatchesByDate,
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
import { SIDEBAR_LEAGUES } from '@/config/leagues';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import { getNews } from '@/services/newsApi';
import styles from './index.module.scss';

type SidebarTab = 'standings' | 'leagues' | 'news';

const DEFAULT_COMPETITION_ID = 6;

const today = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [fixtureMatches, setFixtureMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [activeTab, setActiveTab] = useState<MatchTab>('all');

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('leagues');
  const [selectedCompId, setSelectedCompId] = useState(DEFAULT_COMPETITION_ID);
  const [standings, setStandings] = useState<CompetitionTableData | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [topScorers, setTopScorers] = useState<TopScorersPayload | null>(null);
  const [topScorersLoading, setTopScorersLoading] = useState(false);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [historyAll, liveAll, fixtures] = await Promise.all([
      getAllMatchesByDate(selectedDate),
      getAllLiveMatches(),
      getFixturesByDate(selectedDate),
    ]);
    setAllMatches(historyAll);
    setLiveMatches(liveAll);
    setFixtureMatches(fixtures);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(async () => {
      const [liveAll, fixtures] = await Promise.all([
        getAllLiveMatches(),
        getFixturesByDate(selectedDate),
      ]);
      setLiveMatches(liveAll);
      setFixtureMatches(fixtures);
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchData, selectedDate]);

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
    let cancelled = false;
    const compId = String(selectedCompId);
    setStandingsLoading(true);
    setTopScorersLoading(true);

    (async () => {
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
  }, [selectedCompId]);

  useEffect(() => {
    if (sidebarTab !== 'news' || newsItems.length > 0) return;
    let cancelled = false;
    setNewsLoading(true);
    getNews(15).then((items) => {
      if (!cancelled) {
        setNewsItems(items);
        setNewsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [sidebarTab, newsItems.length]);

  const displayMatches = useMemo(() => {
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
  }, [activeTab, allMatches, liveMatches, fixtureMatches, selectedDate]);

  const grouped = useMemo(() => {
    const raw = groupMatchesByLeague(displayMatches);
    return activeTab === 'all' ? sortGroupedMatchesForAllTab(raw) : raw;
  }, [activeTab, displayMatches]);

  const selectedLeagueName =
    SIDEBAR_LEAGUES.find((l) => l.id === selectedCompId)?.name ?? 'Lig';

  function handleLeagueClick(competitionId: number) {
    setSelectedCompId(competitionId);
    setSidebarTab('standings');
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
                    {SIDEBAR_LEAGUES.map((league) => (
                      <li key={league.id}>
                        <button
                          type="button"
                          className={`${styles.leagueItem} ${league.id === selectedCompId ? styles.leagueItemActive : ''}`}
                          onClick={() => handleLeagueClick(league.id)}
                        >
                          {league.logo ? (
                            <img
                              src={league.logo}
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
                    ))}
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
                <MatchList groupedMatches={grouped} />
              </>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
