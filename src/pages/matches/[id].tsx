import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Container from '@/components/Container';
import MatchCard from '@/components/MatchCard';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import MatchStats from '@/components/MatchStats';
import { getMatchWithEvents, getMatchLineups, getMatchStats } from '@/services/liveScoreService';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
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
        </div>
      </div>
    </Container>
  );
}
