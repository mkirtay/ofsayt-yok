import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import Container from '@/components/Container';
import MatchCard from '@/components/MatchCard';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import MatchStats from '@/components/MatchStats';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchForum from '@/components/MatchForum';
import {
  getMatchWithEvents,
  getMatchLineups,
  getMatchStats,
  getCompetitionTableFull,
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
} from '@/services/liveScoreService';
import { Match } from '@/models/liveScore';
import { MatchEvent, MatchStatsData } from '@/models/domain';
import styles from './matchDetail.module.scss';

export default function MatchDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineups, setLineups] = useState<any>(null);
  const [stats, setStats] = useState<MatchStatsData | null>(null);
  const [standings, setStandings] = useState<CompetitionTableData | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsReady, setStandingsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  const handleSeasonChange = useCallback(async (seasonId: number, competitionIdStr: string) => {
    setSelectedSeasonId(seasonId);
    setStandingsLoading(true);
    const table = await getCompetitionTableFull(competitionIdStr, { season: seasonId });
    setStandings(table);
    setStandingsLoading(false);
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      setStandings(null);
      setStandingsLoading(false);
      setStandingsReady(false);
      const matchIdStr = id as string;

      const [matchEventsRes, lineupsData, statsData] = await Promise.all([
        getMatchWithEvents(matchIdStr),
        getMatchLineups(matchIdStr),
        getMatchStats(matchIdStr),
      ]);

      setMatch(matchEventsRes.match);
      setEvents(matchEventsRes.events);
      setLineups(lineupsData);
      setStats(statsData);
      setLoading(false);

      const m = matchEventsRes.match;
      const compId = m?.competition?.id ?? m?.competition_id;
      if (compId != null) {
        setStandingsLoading(true);
        const compIdStr = String(compId);
        const [seasonsList, table1] = await Promise.all([
          getSeasonsList(),
          getCompetitionTableFull(compIdStr),
        ]);
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
          tableFinal = await getCompetitionTableFull(compIdStr, { season: sid });
        }
        setStandings(tableFinal ?? table1);
        setStandingsLoading(false);
        setStandingsReady(true);
      } else {
        setSeasons([]);
        setSelectedSeasonId(null);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <Container>
        <div className={styles.loading}>Yükleniyor...</div>
      </Container>
    );
  }

  const homeTeamId = match?.home?.id ?? match?.home_id;
  const awayTeamId = match?.away?.id ?? match?.away_id;
  const compId = match?.competition?.id ?? match?.competition_id;
  const showStandingsBlock = compId != null && (standingsLoading || standingsReady);

  return (
    <Container>
      <div className="layout-split">
        <div className="layout-left">
          <MatchCard match={match} />
          <div className={styles.statsEventsRow}>
            <div className={styles.statsCol}>
              <MatchStats stats={stats} />
            </div>
            <div className={styles.eventsCol}>
              <EventTimeline
                events={events}
                homeName={match?.home?.name}
                awayName={match?.away?.name}
              />
            </div>
          </div>
          <Lineup lineups={lineups} />
        </div>
        <div className="layout-right">
          <MatchForum matchId={id as string} />
          {showStandingsBlock ? (
            <MatchCompetitionStandings
              data={standings}
              loading={standingsLoading}
              competitionName={match?.competition?.name ?? match?.competition_name}
              homeTeamId={homeTeamId}
              awayTeamId={awayTeamId}
              seasons={seasons}
              selectedSeasonId={selectedSeasonId}
              onSeasonChange={
                compId != null
                  ? (sid) => handleSeasonChange(sid, String(compId))
                  : undefined
              }
            />
          ) : null}
        </div>
      </div>
    </Container>
  );
}
