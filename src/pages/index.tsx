import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLiveMatches,
  getMatchesByDate,
  groupMatchesByLeague,
  getCompetitionTableFull,
  type CompetitionTableData,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import MatchList from '@/components/MatchList';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import SubHeader, { type MatchTab } from '@/components/SubHeader';
import Container from '@/components/Container';
import { SIDEBAR_LEAGUES } from '@/config/leagues';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import styles from './index.module.scss';

type SidebarTab = 'standings' | 'leagues' | 'stats';

const DEFAULT_COMPETITION_ID = 6;

const today = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [activeTab, setActiveTab] = useState<MatchTab>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('leagues');
  const [selectedCompId, setSelectedCompId] = useState(DEFAULT_COMPETITION_ID);
  const [standings, setStandings] = useState<CompetitionTableData | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [dateRes, liveRes] = await Promise.all([
      getMatchesByDate(selectedDate, page),
      getLiveMatches(page),
    ]);
    setAllMatches(dateRes.matches);
    setTotalPages(dateRes.totalPages);
    setLiveMatches(liveRes.matches);
    setLoading(false);
  }, [selectedDate, page]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(async () => {
      const liveRes = await getLiveMatches(page);
      setLiveMatches(liveRes.matches);
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchData, page]);

  useEffect(() => {
    let cancelled = false;
    setStandingsLoading(true);
    getCompetitionTableFull(String(selectedCompId)).then((data) => {
      if (!cancelled) {
        setStandings(data);
        setStandingsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [selectedCompId]);

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
        return allMatches;
    }
  }, [activeTab, allMatches, liveMatches]);

  const grouped = useMemo(() => groupMatchesByLeague(displayMatches), [displayMatches]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

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
          setPage(1);
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
                  className={`${styles.sidebarTab} ${sidebarTab === 'stats' ? styles.sidebarTabActive : ''}`}
                  onClick={() => setSidebarTab('stats')}
                >
                  İstatistikler
                </button>
              </nav>

              <div className={styles.sidebarContent}>
                {sidebarTab === 'standings' && (
                  <MatchCompetitionStandings
                    data={standings}
                    loading={standingsLoading}
                    competitionName={selectedLeagueName}
                  />
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

                {sidebarTab === 'stats' && (
                  <div className={styles.empty}>
                    İstatistikler yakın zamanda eklenecek.
                  </div>
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
                {totalPages > 1 && (
                  <nav className={styles.pagination} aria-label="Sayfa">
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={!canPrev}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Önceki
                    </button>
                    <span className={styles.pageInfo}>
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={!canNext}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Sonraki
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
