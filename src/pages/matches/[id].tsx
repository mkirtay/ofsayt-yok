import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Container from '@/components/Container';
import MatchCard from '@/components/MatchCard';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import MatchStats from '@/components/MatchStats';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import {
  getMatchWithEvents,
  getMatchLineups,
  getMatchStats,
  getCompetitionTableFull,
  type CompetitionTableData,
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
        const table = await getCompetitionTableFull(String(compId));
        setStandings(table);
        setStandingsLoading(false);
        setStandingsReady(true);
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

  const odds = (match as any)?.odds || null;
  const homeTeamId = match?.home?.id ?? match?.home_id;
  const awayTeamId = match?.away?.id ?? match?.away_id;
  const compId = match?.competition?.id ?? match?.competition_id;
  const showStandingsBlock = compId != null && (standingsLoading || standingsReady);

  return (
    <Container>
      <div className="layout-split">
        <div className="layout-left">
          <MatchCard match={match} />
          <EventTimeline
            events={events}
            homeName={match?.home?.name}
            awayName={match?.away?.name}
          />
          <Lineup lineups={lineups} />
        </div>
        <div className="layout-right">
          <MatchStats stats={stats} odds={odds} />
          {showStandingsBlock ? (
            <MatchCompetitionStandings
              data={standings}
              loading={standingsLoading}
              competitionName={match?.competition?.name ?? match?.competition_name}
              homeTeamId={homeTeamId}
              awayTeamId={awayTeamId}
            />
          ) : null}
        </div>
      </div>
    </Container>
  );
}
