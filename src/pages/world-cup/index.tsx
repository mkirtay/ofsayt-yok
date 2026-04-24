import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchList from '@/components/MatchList';
import NewsList from '@/components/NewsList';
import WorldCupGroupCard from '@/components/WorldCupGroupCard';
import WorldCupLayout from '@/components/layouts/WorldCupLayout';
import {
  sortWorldCupGroupsByName,
  pickWorldCupSeasonsFromApi,
  WORLD_CUP_COMPETITION_ID,
  WORLD_CUP_DEFAULT_SEASON_ID,
} from '@/config/worldCup';
import type { NewsItem } from '@/models/domain';
import {
  CompetitionGroupItem,
  CompetitionTableData,
  CompetitionTableStandingRow,
  GroupedLeagueMatches,
  getAllCompetitionHistoryMatches,
  getAllLiveMatches,
  getCompetitionGroupFixtures,
  getCompetitionTableFull,
  getSeasonsList,
  mergeFixturesWithHistoryAndLive,
  type SeasonListItem,
} from '@/services/liveScoreService';
import { getNews } from '@/services/newsApi';
import type { WorldCupBootstrapServerPayload } from '@/server/loadWorldCupBootstrapData';
import { loadWorldCupBootstrapData } from '@/server/loadWorldCupBootstrapData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import styles from './worldCup.module.scss';

type WorldCupMainTab = 'groups' | 'matches';
type SidebarTab = 'standings' | 'groups' | 'news';

type GroupStandings = {
  id: number;
  name: string;
  standings: CompetitionTableStandingRow[];
};

const WORLD_CUP_ID = String(WORLD_CUP_COMPETITION_ID);

function extractGroupsFromTable(data: CompetitionTableData | null): CompetitionGroupItem[] {
  if (!data?.stages?.length) return [];
  const raw = data.stages.flatMap((stage) => stage.groups ?? []);
  return sortWorldCupGroupsByName(
    raw
      .map((g): CompetitionGroupItem | null => {
        const id = Number(g?.id);
        const name = String(g?.name ?? '').trim();
        if (!Number.isFinite(id) || !name) return null;
        return { id, name };
      })
      .filter((g): g is CompetitionGroupItem => g != null),
  );
}

function extractGroupStandings(data: CompetitionTableData | null): GroupStandings[] {
  if (!data?.stages?.length) return [];
  const groups = data.stages.flatMap((stage) =>
    (stage.groups || []).map((group) => ({
      id: Number(group.id),
      name: String(group.name || ''),
      standings: group.standings || [],
    })),
  );
  return sortWorldCupGroupsByName(
    groups.filter((g) => Number.isFinite(g.id) && g.name),
  );
}

type WorldCupPageProps = {
  wcBootstrap: WorldCupBootstrapServerPayload | null;
};

export default function WorldCupPage({
  wcBootstrap,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [mainTab, setMainTab] = useState<WorldCupMainTab>('groups');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('groups');

  const [tableData, setTableData] = useState<CompetitionTableData | null>(
    () => wcBootstrap?.tableData ?? null
  );
  const [loading, setLoading] = useState(() => !wcBootstrap);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(
    () => wcBootstrap?.selectedGroupId ?? null
  );
  const [selectedGroupTable, setSelectedGroupTable] = useState<CompetitionTableData | null>(null);
  const [selectedGroupLoading, setSelectedGroupLoading] = useState(false);

  const [seasons, setSeasons] = useState<SeasonListItem[]>(() => wcBootstrap?.seasons ?? []);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(
    () => wcBootstrap?.selectedSeasonId ?? null
  );

  const skipWcBootstrap = useRef(!!wcBootstrap);

  const [groupMatches, setGroupMatches] = useState<GroupedLeagueMatches[]>([]);
  const [groupMatchesLoading, setGroupMatchesLoading] = useState(false);

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);

  const groups = useMemo(() => extractGroupsFromTable(tableData), [tableData]);
  const groupCards = useMemo(() => extractGroupStandings(tableData), [tableData]);

  const selectedGroupName = useMemo(
    () => groups.find((g) => g.id === selectedGroupId)?.name || '—',
    [groups, selectedGroupId],
  );

  // World Cup dark theme class
  useEffect(() => {
    document.body.classList.add('worldCupTheme');
    return () => {
      document.body.classList.remove('worldCupTheme');
    };
  }, []);

  // Bootstrap: fetch table + seasons once
  useEffect(() => {
    let cancelled = false;

    if (skipWcBootstrap.current) {
      skipWcBootstrap.current = false;
      return () => {
        cancelled = true;
      };
    }

    const bootstrap = async () => {
      setLoading(true);
      setError(null);

      try {
        const seasonsList = await getSeasonsList({ skipCalendarYearDedupe: true });
        if (cancelled) return;

        const wcSeasons = pickWorldCupSeasonsFromApi(seasonsList);
        setSeasons(wcSeasons);

        const defaultSeasonId =
          wcSeasons.find((s) => s.id === WORLD_CUP_DEFAULT_SEASON_ID)?.id ??
          wcSeasons[0]?.id ??
          null;

        const table = await getCompetitionTableFull(
          WORLD_CUP_ID,
          defaultSeasonId != null ? { season: defaultSeasonId } : undefined,
        );
        if (cancelled) return;

        setTableData(table);
        setSelectedSeasonId(defaultSeasonId);

        const groupsFromTable = extractGroupsFromTable(table);
        if (groupsFromTable.length) {
          setSelectedGroupId((prev) => prev ?? groupsFromTable[0]!.id);
        }
      } catch (e) {
        if (cancelled) return;
        console.error('WorldCup bootstrap error', e);
        setError('Grup verileri yüklenemedi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Season change: re-fetch table with season_id
  const handleSeasonChange = useCallback(async (seasonId: number) => {
    setSelectedSeasonId(seasonId);
    setLoading(true);

    try {
      const table = await getCompetitionTableFull(WORLD_CUP_ID, { season: seasonId });
      setTableData(table);
    } catch (e) {
      console.error('Season change error', e);
    } finally {
      setLoading(false);
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
    return () => {
      cancelled = true;
    };
  }, [selectedGroupId, selectedSeasonId]);

  // Fetch fixtures when matches tab is active; history + canlı ile skor / MS / CANLI
  useEffect(() => {
    if (mainTab !== 'matches' || !groups.length) return;
    let cancelled = false;

    const fetchFixtures = async () => {
      setGroupMatchesLoading(true);
      const [historyMatches, liveAll] = await Promise.all([
        getAllCompetitionHistoryMatches(WORLD_CUP_ID, { maxPages: 35 }),
        getAllLiveMatches(),
      ]);
      if (cancelled) return;

      const liveWc = liveAll.filter((m) => m.competition?.id === WORLD_CUP_COMPETITION_ID);

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
        setGroupMatches(byGroup.filter((g) => g.matches.length > 0));
        setGroupMatchesLoading(false);
      }
    };

    fetchFixtures();
    return () => {
      cancelled = true;
    };
  }, [mainTab, groups, selectedSeasonId]);

  // Fetch news lazily
  useEffect(() => {
    if (sidebarTab !== 'news' || newsItems.length > 0) return;
    let cancelled = false;
    getNews(15).then((items) => {
      if (!cancelled) setNewsItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, [newsItems.length, sidebarTab]);

  const newsLoading = sidebarTab === 'news' && newsItems.length === 0;

  return (
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
              groups.length ? (
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
                <div className={styles.empty}>
                  {loading ? 'Yükleniyor...' : 'Grup bulunamadı.'}
                </div>
              )
            )}

            {sidebarTab === 'news' && <NewsList items={newsItems} loading={newsLoading} />}
          </div>
        </div>
      }
      content={
        <section className={styles.content}>
          {mainTab === 'groups' ? (
            loading ? (
              <div className={styles.loading}>Dünya kupası grupları yükleniyor...</div>
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
          ) : groupMatchesLoading ? (
            <div className={styles.loading}>Grup maçları yükleniyor...</div>
          ) : groupMatches.length ? (
            <MatchList groupedMatches={groupMatches} variant="worldCup" />
          ) : (
            <div className={styles.empty}>Bu tarih için dünya kupası fikstürü bulunamadı.</div>
          )}
        </section>
      }
    />
  );
}

export const getServerSideProps: GetServerSideProps<WorldCupPageProps> = async (ctx) => {
  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=180'
  );
  const raw = await loadWorldCupBootstrapData(ctx.req);
  return {
    props: {
      wcBootstrap: raw == null ? null : propsJsonSafe(raw),
    },
  };
};
