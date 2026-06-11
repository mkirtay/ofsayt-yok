import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchList from '@/components/MatchList';
import NewsList from '@/components/NewsList';
import WorldCupGroupCard from '@/components/WorldCupGroupCard';
import WorldCupLayout from '@/components/layouts/WorldCupLayout';
import WorldCupCalendar from '@/components/WorldCupCalendar';
import WorldCupTeamList, { extractAllTeams } from '@/components/WorldCupTeamList';
import type { TeamEntry } from '@/components/WorldCupTeamList';
import WorldCupTeamDrawer from '@/components/WorldCupTeamDrawer';
import UefaKnockoutBracket from '@/components/UefaKnockoutBracket';
import {
  WorldCupGroupCardsSkeleton,
  MatchListSkeleton,
  StandingsSkeleton,
} from '@/components/Skeleton';
import { buildWorldCupBracketRounds } from '@/utils/worldCupBracket';
import {
  WORLD_CUP_COMPETITION_ID,
} from '@/config/worldCup';
import type { NewsItem } from '@/models/domain';
import type { Match } from '@/models/liveScore';
import {
  CompetitionTableData,
  GroupedLeagueMatches,
  getAllCompetitionHistoryMatches,
  getAllLiveMatches,
  getCompetitionGroupFixtures,
  getCompetitionTableFull,
  mergeFixturesWithHistoryAndLive,
  type SeasonListItem,
} from '@/services/liveScoreService';
import { getNews } from '@/services/newsApi';
import { useWorldCupBootstrap } from '@/hooks/useWorldCupBootstrap';
import { extractGroupStandings, extractGroupsFromTable } from '@/utils/worldCupTable';
import styles from './worldCup.module.scss';

type WorldCupMainTab = 'groups' | 'matches' | 'calendar' | 'bracket' | 'teams';
type SidebarTab = 'standings' | 'groups' | 'news';

const WORLD_CUP_ID = String(WORLD_CUP_COMPETITION_ID);
const FAV_TEAMS_KEY = 'oy_wc_fav_teams';

export default function WorldCupPage() {
  const { data: session } = useSession();
  const bootstrapQuery = useWorldCupBootstrap();
  const [mainTab, setMainTab] = useState<WorldCupMainTab>('groups');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('groups');

  const [tableData, setTableData] = useState<CompetitionTableData | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedGroupTable, setSelectedGroupTable] = useState<CompetitionTableData | null>(null);
  const [selectedGroupLoading, setSelectedGroupLoading] = useState(false);

  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  const liveCheckedRef = useRef(false);

  const [groupMatches, setGroupMatches] = useState<GroupedLeagueMatches[]>([]);
  const [allMatchesFlat, setAllMatchesFlat] = useState<Match[]>([]);
  const [groupMatchesLoading, setGroupMatchesLoading] = useState(false);

  const loading = bootstrapQuery.isLoading || seasonLoading;

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);

  // Favorites
  const [favoriteTeamIds, setFavoriteTeamIds] = useState<number[]>([]);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  // Team drawer
  const [selectedTeam, setSelectedTeam] = useState<TeamEntry | null>(null);

  const groups = useMemo(() => extractGroupsFromTable(tableData), [tableData]);
  const groupCards = useMemo(() => extractGroupStandings(tableData), [tableData]);

  const selectedGroupName = useMemo(
    () => groups.find((g) => g.id === selectedGroupId)?.name || '—',
    [groups, selectedGroupId],
  );

  // Bracket data
  const bracketRounds = useMemo(
    () => buildWorldCupBracketRounds(allMatchesFlat),
    [allMatchesFlat]
  );

  // World Cup dark theme class
  useEffect(() => {
    document.body.classList.add('worldCupTheme');
    return () => {
      document.body.classList.remove('worldCupTheme');
    };
  }, []);

  // Load favorites: session → API, guest → localStorage
  useEffect(() => {
    if (session?.user) {
      fetch('/api/user/favorites')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data?.favoriteTeamIds)) {
            setFavoriteTeamIds(data.favoriteTeamIds);
          }
        })
        .catch(() => {});
    } else {
      try {
        const raw = localStorage.getItem(FAV_TEAMS_KEY);
        if (raw) setFavoriteTeamIds(JSON.parse(raw));
      } catch {
        // ignore
      }
    }
  }, [session]);

  const handleToggleFavorite = useCallback(
    (teamId: number) => {
      setFavoriteTeamIds((prev) => {
        const next = prev.includes(teamId)
          ? prev.filter((id) => id !== teamId)
          : [...prev, teamId];

        if (session?.user) {
          fetch('/api/user/favorites', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favoriteTeamIds: next }),
          }).catch(() => {});
        } else {
          try {
            localStorage.setItem(FAV_TEAMS_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
        }

        return next;
      });
    },
    [session]
  );

  // Sync bootstrap query into local state (season changes override tableData locally)
  useEffect(() => {
    if (!bootstrapQuery.data) return;
    setTableData(bootstrapQuery.data.tableData);
    setSeasons(bootstrapQuery.data.seasons);
    setSelectedSeasonId(bootstrapQuery.data.selectedSeasonId);
    setSelectedGroupId((prev) => prev ?? bootstrapQuery.data!.selectedGroupId);
    setError(null);
  }, [bootstrapQuery.data]);

  useEffect(() => {
    if (bootstrapQuery.isError) {
      setError('Grup verileri yüklenemedi.');
    }
  }, [bootstrapQuery.isError]);

  // Season change
  const handleSeasonChange = useCallback(async (seasonId: number) => {
    setSelectedSeasonId(seasonId);
    setSeasonLoading(true);
    try {
      const table = await getCompetitionTableFull(WORLD_CUP_ID, { season: seasonId });
      setTableData(table);
    } catch (e) {
      console.error('Season change error', e);
    } finally {
      setSeasonLoading(false);
    }
  }, []);

  // Fetch selected group standings for sidebar
  useEffect(() => {
    if (selectedGroupId == null) return;
    let cancelled = false;

    const fetchGroupTable = async () => {
      setSelectedGroupLoading(true);
      const data = await getCompetitionTableFull(WORLD_CUP_ID, {
        group_id: selectedGroupId,
        ...(selectedSeasonId != null ? { season: selectedSeasonId } : {}),
      });
      if (!cancelled) {
        setSelectedGroupTable(data);
        setSelectedGroupLoading(false);
      }
    };

    fetchGroupTable();
    return () => { cancelled = true; };
  }, [selectedGroupId, selectedSeasonId]);

  // Merge live scores into SSR fixture data once they're fetched
  useEffect(() => {
    if (!['matches', 'calendar', 'bracket'].includes(mainTab) || !groups.length) return;
    const needsClientFetch = groupMatches.length === 0;
    // SSR data present + live check already done this session → nothing to do
    if (!needsClientFetch && liveCheckedRef.current) return;
    let cancelled = false;

    const fetchFixtures = async () => {
      if (needsClientFetch) setGroupMatchesLoading(true);

      const [historyMatches, liveAll] = await Promise.all([
        getAllCompetitionHistoryMatches(WORLD_CUP_ID, {
          maxPages: 10,
          season_id: selectedSeasonId ?? undefined,
        }),
        getAllLiveMatches(),
      ]);
      if (cancelled) return;
      liveCheckedRef.current = true;

      const liveWc = liveAll.filter((m) => m.competition?.id === WORLD_CUP_COMPETITION_ID);

      // If no live WC matches and SSR data is present, skip the expensive re-merge
      if (!needsClientFetch && liveWc.length === 0) {
        setGroupMatchesLoading(false);
        return;
      }

      const byGroup = await Promise.all(
        groups.map(async (group) => {
          const fixtures = await getCompetitionGroupFixtures(WORLD_CUP_ID, group.id);
          const merged = mergeFixturesWithHistoryAndLive(fixtures, historyMatches, liveWc);
          return {
            competition_id: Number(group.id),
            competition_name: `Group ${group.name}`,
            matches: merged.sort((a, b) => {
              const aKey = `${a.date || ''} ${a.scheduled || a.time || ''}`.trim();
              const bKey = `${b.date || ''} ${b.scheduled || b.time || ''}`.trim();
              return aKey.localeCompare(bKey);
            }),
          } as GroupedLeagueMatches;
        }),
      );

      if (!cancelled) {
        const groupMatchesFilled = byGroup.filter((g) => g.matches.length > 0);
        setGroupMatches(groupMatchesFilled);

        const seen = new Set<number>();
        const deduped = [
          ...historyMatches,
          ...groupMatchesFilled.flatMap((g) => g.matches),
        ].filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        setAllMatchesFlat(deduped);
        setGroupMatchesLoading(false);
      }
    };

    fetchFixtures();
    return () => { cancelled = true; };
  }, [mainTab, groups, groupMatches.length, selectedSeasonId]);

  // Fetch news lazily
  useEffect(() => {
    if (sidebarTab !== 'news' || newsItems.length > 0) return;
    let cancelled = false;
    getNews(15).then((items) => {
      if (!cancelled) setNewsItems(items);
    });
    return () => { cancelled = true; };
  }, [newsItems.length, sidebarTab]);

  const newsLoading = sidebarTab === 'news' && newsItems.length === 0;

  const isMatchDataTab = mainTab === 'matches' || mainTab === 'calendar' || mainTab === 'bracket';

  const favTeamSet = useMemo(() => new Set(favoriteTeamIds), [favoriteTeamIds]);

  const filteredGroupMatches = useMemo(() => {
    if (!showOnlyFavorites || favoriteTeamIds.length === 0) return groupMatches;
    return groupMatches
      .map((g) => ({
        ...g,
        matches: g.matches.filter(
          (m) => favTeamSet.has(m.home?.id ?? -1) || favTeamSet.has(m.away?.id ?? -1),
        ),
      }))
      .filter((g) => g.matches.length > 0);
  }, [groupMatches, showOnlyFavorites, favoriteTeamIds, favTeamSet]);

  return (
    <>
      <Head>
        <title>FIFA Dünya Kupası 2026 | Ofsayt Yok</title>
        <meta name="description" content="FIFA Dünya Kupası 2026 grup aşaması, fikstür ve puan durumu. Tüm grupları ve maçları takip edin." />
        <meta property="og:title" content="FIFA Dünya Kupası 2026 | Ofsayt Yok" />
        <meta property="og:description" content="FIFA Dünya Kupası 2026 grup aşaması, fikstür ve puan durumu. Tüm grupları ve maçları takip edin." />
        <meta property="og:url" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/world-cup`} />
        <meta property="og:image" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/images/2026_FIFA_World_Cup_Logo.png`} />
        <meta name="twitter:image" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/images/2026_FIFA_World_Cup_Logo.png`} />
        <link rel="canonical" href={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/world-cup`} />
      </Head>
      <WorldCupLayout
        activeTab={mainTab}
        onTabChange={setMainTab}
        sidebar={
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
                className={`${styles.sidebarTab} ${sidebarTab === 'groups' ? styles.sidebarTabActive : ''}`}
                onClick={() => setSidebarTab('groups')}
              >
                Gruplar
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
                <MatchCompetitionStandings
                  data={selectedGroupTable}
                  loading={selectedGroupLoading}
                  competitionName={`FIFA World Cup - Group ${selectedGroupName}`}
                  variant="worldCup"
                  seasons={seasons}
                  selectedSeasonId={selectedSeasonId}
                  onSeasonChange={handleSeasonChange}
                />
              )}

              {sidebarTab === 'groups' && (
                loading ? (
                  <StandingsSkeleton variant="dark" />
                ) : groups.length ? (
                  <ul className={styles.groupList}>
                    {groups.map((group) => (
                      <li key={group.id}>
                        <button
                          type="button"
                          className={`${styles.groupItem} ${
                            group.id === selectedGroupId ? styles.groupItemActive : ''
                          }`}
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            setSidebarTab('standings');
                          }}
                        >
                          Group {group.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.empty}>Grup bulunamadı.</div>
                )
              )}

              {sidebarTab === 'news' && <NewsList items={newsItems} loading={newsLoading} />}
            </div>
          </div>
        }
        content={
          <section className={styles.content}>
            {/* Gruplar */}
            {mainTab === 'groups' && (
              loading ? (
                <div className={styles.groupCards}>
                  <WorldCupGroupCardsSkeleton />
                </div>
              ) : error ? (
                <div className={styles.empty}>{error}</div>
              ) : groupCards.length ? (
                <div className={styles.groupCards}>
                  {groupCards.map((group) => (
                    <WorldCupGroupCard
                      key={group.id}
                      groupName={group.name}
                      standings={group.standings}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>Grup bulunamadı.</div>
              )
            )}

            {/* Maçlar */}
            {mainTab === 'matches' && (
              groupMatchesLoading ? (
                <MatchListSkeleton groups={4} variant="dark" />
              ) : (
                <>
                  {favoriteTeamIds.length > 0 && (
                    <div className={styles.favFilterBar}>
                      <button
                        type="button"
                        className={`${styles.favFilterBtn} ${showOnlyFavorites ? styles.favFilterBtnActive : ''}`}
                        onClick={() => setShowOnlyFavorites((v) => !v)}
                      >
                        ★ Sadece favoriler
                      </button>
                    </div>
                  )}
                  {filteredGroupMatches.length ? (
                    <MatchList
                      groupedMatches={filteredGroupMatches}
                      variant="worldCup"
                      showDateWhenNotToday
                      favoriteTeamIds={favTeamSet}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ) : (
                    <div className={styles.empty}>
                      {showOnlyFavorites
                        ? 'Favori takımlarınızın maçı bulunamadı.'
                        : 'Bu tarih için dünya kupası fikstürü bulunamadı.'}
                    </div>
                  )}
                </>
              )
            )}

            {/* Takvim */}
            {mainTab === 'calendar' && (
              groupMatchesLoading ? (
                <MatchListSkeleton groups={3} variant="dark" />
              ) : (
                <WorldCupCalendar matches={allMatchesFlat} />
              )
            )}

            {/* Eleme Turu */}
            {mainTab === 'bracket' && (
              groupMatchesLoading ? (
                <MatchListSkeleton groups={2} variant="dark" />
              ) : bracketRounds.length ? (
                <UefaKnockoutBracket
                  rounds={bracketRounds}
                  competitionName="FIFA Dünya Kupası 2026"
                />
              ) : (
                <div className={styles.empty}>
                  Eleme turu maçları henüz başlamadı. Grup aşaması tamamlandıktan sonra burada görüntülenecek.
                </div>
              )
            )}

            {/* Takımlar */}
            {mainTab === 'teams' && (
              loading ? (
                <div className={styles.groupCards}>
                  <WorldCupGroupCardsSkeleton count={6} />
                </div>
              ) : (
                <WorldCupTeamList
                  tableData={tableData}
                  favoriteTeamIds={favoriteTeamIds}
                  onToggleFavorite={handleToggleFavorite}
                  onSelectTeam={setSelectedTeam}
                />
              )
            )}
          </section>
        }
      />

      {/* Team Drawer */}
      <WorldCupTeamDrawer
        team={selectedTeam}
        groupMatches={groupMatches}
        onClose={() => setSelectedTeam(null)}
      />
    </>
  );
}
