import { useCallback, useEffect, useMemo, useState } from 'react';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchList from '@/components/MatchList';
import NewsList from '@/components/NewsList';
import WorldCupGroupCard from '@/components/WorldCupGroupCard';
import WorldCupLayout from '@/components/layouts/WorldCupLayout';
import { sortWorldCupGroupsByName, WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';
import type { NewsItem } from '@/models/domain';
import {
  CompetitionGroupItem,
  CompetitionTableData,
  CompetitionTableStandingRow,
  GroupedLeagueMatches,
  getCompetitionGroupFixtures,
  getCompetitionGroups,
  getCompetitionTableFull,
  getSeasonsList,
  type SeasonListItem,
} from '@/services/liveScoreService';
import { getNews } from '@/services/newsApi';
import styles from './worldCup.module.scss';

type WorldCupMainTab = 'groups' | 'matches';
type SidebarTab = 'standings' | 'groups' | 'news';

type GroupStandings = {
  id: number;
  name: string;
  standings: CompetitionTableStandingRow[];
};

const WORLD_CUP_ID = String(WORLD_CUP_COMPETITION_ID);

function extractGroupStandings(data: CompetitionTableData | null): GroupStandings[] {
  if (!data?.stages?.length) return [];
  const groups = data.stages.flatMap((stage) =>
    (stage.groups || []).map((group) => ({
      id: Number(group.id),
      name: String(group.name || ''),
      standings: group.standings || [],
    })),
  );
  return groups.filter((group) => Number.isFinite(group.id) && group.name);
}

function sortGroupStandings(groups: GroupStandings[]): GroupStandings[] {
  return sortWorldCupGroupsByName(groups);
}

export default function WorldCupPage() {
  const [mainTab, setMainTab] = useState<WorldCupMainTab>('groups');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('groups');
  const [groups, setGroups] = useState<CompetitionGroupItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [selectedGroupTable, setSelectedGroupTable] = useState<CompetitionTableData | null>(null);
  const [selectedGroupLoading, setSelectedGroupLoading] = useState(false);

  const [groupCards, setGroupCards] = useState<GroupStandings[]>([]);
  const [groupCardsLoading, setGroupCardsLoading] = useState(true);

  const [groupMatches, setGroupMatches] = useState<GroupedLeagueMatches[]>([]);
  const [groupMatchesLoading, setGroupMatchesLoading] = useState(false);

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);

  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  const loadGroupCardsForSeason = useCallback(
    async (seasonId: number, groupsData: CompetitionGroupItem[]) => {
      const fullTableData = await getCompetitionTableFull(WORLD_CUP_ID, { season: seasonId });
      let allGroupStandings = sortGroupStandings(extractGroupStandings(fullTableData));

      if (!allGroupStandings.length && groupsData.length) {
        const fetched = await Promise.all(
          groupsData.map(async (group) => {
            const data = await getCompetitionTableFull(WORLD_CUP_ID, {
              group_id: group.id,
              season: seasonId,
            });
            const firstGroup = extractGroupStandings(data)[0];
            if (!firstGroup) return null;
            return {
              id: Number(group.id),
              name: group.name,
              standings: firstGroup.standings,
            } as GroupStandings;
          }),
        );
        allGroupStandings = sortGroupStandings(
          fetched.filter((group): group is GroupStandings => Boolean(group)),
        );
      }
      return allGroupStandings;
    },
    [],
  );

  const handleSeasonChange = useCallback(
    async (seasonId: number) => {
      setSelectedSeasonId(seasonId);
      setGroupCardsLoading(true);
      const cards = await loadGroupCardsForSeason(seasonId, groups);
      setGroupCards(cards);
      setGroupCardsLoading(false);
    },
    [groups, loadGroupCardsForSeason],
  );

  useEffect(() => {
    document.body.classList.add('worldCupTheme');
    return () => {
      document.body.classList.remove('worldCupTheme');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchGroupsAndCards = async () => {
      setGroupCardsLoading(true);

      const [seasonsList, groupsRaw] = await Promise.all([
        getSeasonsList(),
        getCompetitionGroups(WORLD_CUP_ID),
      ]);
      if (cancelled) return;
      setSeasons(seasonsList);

      const groupsData = sortWorldCupGroupsByName(groupsRaw);
      setGroups(groupsData);
      if (groupsData.length) {
        setSelectedGroupId((prev) => prev ?? Number(groupsData[0].id));
      }

      const table1 = await getCompetitionTableFull(WORLD_CUP_ID);
      if (cancelled) return;

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

      let allGroupStandings: GroupStandings[] = [];
      if (sid != null) {
        allGroupStandings = await loadGroupCardsForSeason(sid, groupsData);
      } else {
        allGroupStandings = sortGroupStandings(extractGroupStandings(table1));

        if (!allGroupStandings.length && groupsData.length) {
          const fetched = await Promise.all(
            groupsData.map(async (group) => {
              const data = await getCompetitionTableFull(WORLD_CUP_ID, { group_id: group.id });
              const firstGroup = extractGroupStandings(data)[0];
              if (!firstGroup) return null;
              return {
                id: Number(group.id),
                name: group.name,
                standings: firstGroup.standings,
              } as GroupStandings;
            }),
          );
          if (cancelled) return;
          allGroupStandings = sortGroupStandings(
            fetched.filter((group): group is GroupStandings => Boolean(group)),
          );
        }
      }

      if (cancelled) return;
      setGroupCards(allGroupStandings);
      setGroupCardsLoading(false);
    };

    fetchGroupsAndCards();

    return () => {
      cancelled = true;
    };
  }, [loadGroupCardsForSeason]);

  useEffect(() => {
    if (selectedGroupId == null) return;
    let cancelled = false;

    const fetchSelectedGroupTable = async () => {
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

    fetchSelectedGroupTable();
    return () => {
      cancelled = true;
    };
  }, [selectedGroupId, selectedSeasonId]);

  useEffect(() => {
    if (mainTab !== 'matches' || !groups.length) return;
    let cancelled = false;

    const fetchWorldCupFixtures = async () => {
      setGroupMatchesLoading(true);
      const byGroup = await Promise.all(
        groups.map(async (group) => {
          const fixtures = await getCompetitionGroupFixtures(WORLD_CUP_ID, group.id);
          return {
            competition_id: Number(group.id),
            competition_name: `Group ${group.name}`,
            matches: fixtures.sort((a, b) => {
              const aDateTime = `${a.date || ''} ${a.scheduled || a.time || ''}`.trim();
              const bDateTime = `${b.date || ''} ${b.scheduled || b.time || ''}`.trim();
              return aDateTime.localeCompare(bDateTime);
            }),
          } as GroupedLeagueMatches;
        }),
      );
      if (!cancelled) {
        setGroupMatches(byGroup.filter((group) => group.matches.length > 0));
        setGroupMatchesLoading(false);
      }
    };

    fetchWorldCupFixtures();
    return () => {
      cancelled = true;
    };
  }, [mainTab, groups]);

  useEffect(() => {
    if (sidebarTab !== 'news' || newsItems.length > 0) return;
    let cancelled = false;
    getNews(15).then((items) => {
      if (!cancelled) {
        setNewsItems(items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [newsItems.length, sidebarTab]);

  const selectedGroupName = useMemo(
    () => groups.find((group) => Number(group.id) === selectedGroupId)?.name || '—',
    [groups, selectedGroupId],
  );
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
            {sidebarTab === 'standings' ? (
              <MatchCompetitionStandings
                data={selectedGroupTable}
                loading={selectedGroupLoading}
                competitionName={`FIFA World Cup - Group ${selectedGroupName}`}
                variant="worldCup"
                seasons={seasons}
                selectedSeasonId={selectedSeasonId}
                onSeasonChange={handleSeasonChange}
              />
            ) : null}

            {sidebarTab === 'groups' ? (
              <ul className={styles.groupList}>
                {groups.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      className={`${styles.groupItem} ${
                        Number(group.id) === selectedGroupId ? styles.groupItemActive : ''
                      }`}
                      onClick={() => {
                        setSelectedGroupId(Number(group.id));
                        setSidebarTab('standings');
                      }}
                    >
                      Group {group.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {sidebarTab === 'news' ? <NewsList items={newsItems} loading={newsLoading} /> : null}
          </div>
        </div>
      }
      content={
        <section className={styles.content}>
          {mainTab === 'groups' ? (
            groupCardsLoading ? (
              <div className={styles.loading}>Dünya kupası grupları yükleniyor...</div>
            ) : (
              <div className={styles.groupCards}>
                {groupCards.map((group) => (
                  <WorldCupGroupCard key={group.id} groupName={group.name} standings={group.standings} />
                ))}
              </div>
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
