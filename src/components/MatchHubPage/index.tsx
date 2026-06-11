import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  groupMatchesByLeague,
  mergeMatchesForAllTab,
  sortGroupedMatchesForAllTab,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import type { NewsItem } from '@/models/domain';
import {
  fetchCompetitionSidebarForSeason,
  useCompetitionSidebar,
} from '@/hooks/useCompetitionSidebar';
import {
  refreshHomeHubLiveFixtures,
  useHomeHubMatches,
} from '@/hooks/useHomeHubMatches';
import {
  refreshUefaHubLiveFixtures,
  useUefaHubMatches,
} from '@/hooks/useUefaHubMatches';
import MatchList from '@/components/MatchList';
import { MatchListSkeleton } from '@/components/Skeleton';
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

type SidebarTab = 'standings' | 'leagues' | 'news';
export type MatchHubMode = 'default' | 'uefa';

export type MatchHubPageProps = {
  sidebarLeagues: SidebarLeague[];
  defaultCompetitionId: number;
  /** Doluysa maç listesi yalnızca bu `competition_id` değerleriyle sınırlı */
  allowedCompetitionIds: number[] | null;
  /** `uefa`: seçili lige göre fikstür + geçmiş + canlı + eleme braketi */
  mode?: MatchHubMode;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function MatchHubPage({
  sidebarLeagues,
  defaultCompetitionId,
  allowedCompetitionIds,
  mode = 'default',
}: MatchHubPageProps) {
  const queryClient = useQueryClient();
  const isUefaMode = mode === 'uefa';
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [activeTab, setActiveTab] = useState<MatchTab>('all');

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('leagues');
  const [selectedCompId, setSelectedCompId] = useState(defaultCompetitionId);
  const homeMatchesQuery = useHomeHubMatches(selectedDate, !isUefaMode);
  const uefaMatchesQuery = useUefaHubMatches(selectedCompId, isUefaMode);
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
  const topScorers = seasonPatch?.topScorers ?? sidebarData?.topScorers ?? null;
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

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const [favoriteTeamIds, setFavoriteTeamIds] = useState<number[]>([]);

  useEffect(() => {
    if (isUefaMode) return;

    const interval = setInterval(() => {
      void refreshHomeHubLiveFixtures(queryClient, selectedDate);
    }, 30_000);
    return () => clearInterval(interval);
  }, [isUefaMode, queryClient, selectedDate]);

  useEffect(() => {
    if (!isUefaMode) return;

    const interval = setInterval(() => {
      void refreshUefaHubLiveFixtures(queryClient, selectedCompId);
    }, 30_000);
    return () => clearInterval(interval);
  }, [isUefaMode, queryClient, selectedCompId]);

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

  const allMatches = homeMatchesQuery.data?.allMatches ?? [];
  const liveMatches = homeMatchesQuery.data?.liveMatches ?? [];
  const fixtureMatches = homeMatchesQuery.data?.fixtureMatches ?? [];
  const uefaLiveMatches = uefaMatchesQuery.data?.liveMatches ?? [];
  const uefaCompFixtures = uefaMatchesQuery.data?.uefaCompFixtures ?? [];
  const uefaHistory = uefaMatchesQuery.data?.uefaHistory ?? [];
  const matchesLoading = isUefaMode ? uefaMatchesQuery.isLoading : homeMatchesQuery.isLoading;

  const uefaMerged = useMemo(() => {
    if (!isUefaMode) return [] as Match[];
    return mergeUefaCompetitionMatches({
      competitionId: selectedCompId,
      liveAll: uefaLiveMatches,
      fixtures: uefaCompFixtures,
      history: uefaHistory,
    });
  }, [isUefaMode, selectedCompId, uefaLiveMatches, uefaCompFixtures, uefaHistory]);

  const uefaBracketRounds = useMemo(() => {
    if (!isUefaMode) return [];
    return buildBracketRounds(uefaMerged);
  }, [isUefaMode, uefaMerged]);

  const favoriteTeamSet = useMemo(() => new Set(favoriteTeamIds), [favoriteTeamIds]);

  const displayMatches = useMemo(() => {
    const isFavMatch = (m: Match) =>
      favoriteTeamSet.has(m.home?.id ?? -1) || favoriteTeamSet.has(m.away?.id ?? -1);

    if (isUefaMode) {
      switch (activeTab) {
        case 'live':
          return uefaMerged.filter(
            (m) => m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK'
          );
        case 'finished':
          return uefaMerged.filter((m) => m.status === 'FINISHED');
        case 'favorites':
          return uefaMerged.filter(isFavMatch);
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
      case 'favorites': {
        const merged = mergeMatchesForAllTab({
          selectedDate,
          historyPageMatches: allMatches,
          liveMatches,
          fixtures: fixtureMatches,
        });
        return merged.filter(isFavMatch);
      }
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
    favoriteTeamSet,
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
            {matchesLoading ? (
              <MatchListSkeleton groups={5} />
            ) : activeTab === 'favorites' && favoriteTeamIds.length === 0 ? (
              <div className={styles.empty}>
                Takım favorilere eklemek için maç satırındaki ☆ butonuna tıklayın.
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
                  favoriteTeamIds={favoriteTeamSet}
                  onToggleFavorite={toggleFavoriteTeam}
                />
              </>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
