import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Container from '@/components/Container';
import MatchCard from '@/components/MatchCard';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import MatchStats from '@/components/MatchStats';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchForum from '@/components/MatchForum';
import MatchAnalysis from '@/components/MatchAnalysis';
import MatchTrivia from '@/components/MatchTrivia';
import MatchPoll from '@/components/MatchPoll';
import JsonLd from '@/components/JsonLd';
import {
  findMatchById,
  getCompetitionTableFull,
  getMatchLineups,
  getMatchStats,
  getMatchWithEvents,
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import type { MatchEvent, MatchStatsData } from '@/models/domain';
import { buildMatchHref, parseMatchIdFromParam } from '@/utils/matchUrl';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';
import { fetchWorldCupStandingsBundle, isWorldCupCompetition } from '@/utils/worldCupStandings';
import styles from './matchDetail.module.scss';

async function loadStandingsForMatch(
  cid: number
): Promise<{
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
}> {
  if (isWorldCupCompetition(cid)) {
    const wc = await fetchWorldCupStandingsBundle();
    return {
      seasons: wc.seasons,
      selectedSeasonId: wc.selectedSeasonId,
      standings: wc.standings,
    };
  }

  const compIdStr = String(cid);
  const [seasonsList, table1] = await Promise.all([
    getSeasonsList(),
    getCompetitionTableFull(compIdStr),
  ]);

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

  const needTableRefetch =
    sid != null &&
    table1 != null &&
    (table1.season?.id == null || Number(table1.season.id) !== sid);

  let tableFinal = table1;
  if (needTableRefetch && sid != null) {
    tableFinal = await getCompetitionTableFull(compIdStr, { season: sid });
  }

  return {
    seasons: seasonsList,
    selectedSeasonId: sid,
    standings: tableFinal ?? table1,
  };
}

export default function MatchDetail() {
  const router = useRouter();
  const slugParam = router.query.slug;
  const slugFromPath = router.asPath.match(/^\/matches\/([^/?#]+)/)?.[1] ?? '';
  const slug =
    typeof slugParam === 'string'
      ? slugParam
      : Array.isArray(slugParam)
        ? slugParam[0] ?? slugFromPath
        : slugFromPath;
  const requestedMatchId = slug ? parseMatchIdFromParam(slug) : '';

  const [matchId, setMatchId] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineups, setLineups] = useState<unknown>(null);
  const [stats, setStats] = useState<MatchStatsData | null>(null);
  const [standings, setStandings] = useState<CompetitionTableData | null>(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [lineupsLoading, setLineupsLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);

  const canonicalPath = useMemo(() => {
    if (match) return buildMatchHref(match);
    if (requestedMatchId) return `/matches/${slug || requestedMatchId}`;
    return '/matches';
  }, [match, requestedMatchId, slug]);

  const compId = match?.competition?.id ?? match?.competition_id;
  const isWorldCup = compId === WORLD_CUP_COMPETITION_ID;

  useEffect(() => {
    document.body.classList.toggle('worldCupHeaderOnly', isWorldCup);
    return () => {
      document.body.classList.remove('worldCupHeaderOnly');
    };
  }, [isWorldCup]);

  useEffect(() => {
    if (!router.isReady || !requestedMatchId) return;

    let cancelled = false;

    void (async () => {
      setMatchLoading(true);
      setEventsLoading(true);
      setStatsLoading(true);
      setLineupsLoading(true);
      setStandingsLoading(true);
      setNotFound(false);
      setMatch(null);
      setEvents([]);
      setLineups(null);
      setStats(null);
      setStandings(null);
      setSeasons([]);
      setSelectedSeasonId(null);
      setMatchId('');

      const found = await findMatchById(requestedMatchId);
      if (cancelled) return;

      if (!found.match) {
        setNotFound(true);
        setMatchLoading(false);
        return;
      }

      const apiMatchId = String(found.match.id);
      setMatchId(apiMatchId);
      setMatch(found.match);
      setEvents(found.events);
      setMatchLoading(false);
      setEventsLoading(found.events.length === 0);

      const canonical = buildMatchHref(found.match);
      if (slug && router.asPath !== canonical) {
        void router.replace(canonical, undefined, { shallow: true });
      }

      if (!found.events.length) {
        void getMatchWithEvents(apiMatchId).then((ev) => {
          if (cancelled) return;
          if (ev.match) setMatch(ev.match);
          setEvents(ev.events);
          setEventsLoading(false);
        });
      }

      const cid = found.match.competition?.id ?? found.match.competition_id;
      if (cid == null) {
        setStandingsLoading(false);
      }

      void getMatchStats(apiMatchId).then((statsData) => {
        if (cancelled) return;
        setStats(statsData);
        setStatsLoading(false);
      });

      void getMatchLineups(apiMatchId).then((lineupsData) => {
        if (cancelled) return;
        setLineups(lineupsData);
        setLineupsLoading(false);
      });

      if (cid != null) {
        void loadStandingsForMatch(cid).then((standingsBundle) => {
          if (cancelled) return;
          setSeasons(standingsBundle.seasons);
          setSelectedSeasonId(standingsBundle.selectedSeasonId);
          setStandings(standingsBundle.standings);
          setStandingsLoading(false);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, requestedMatchId, slug]);

  const handleSeasonChange = useCallback(async (seasonId: number, competitionIdStr: string) => {
    setSelectedSeasonId(seasonId);
    setStandingsLoading(true);
    const table = await getCompetitionTableFull(competitionIdStr, { season: seasonId });
    setStandings(table);
    setStandingsLoading(false);
  }, []);

  const showNotFound = router.isReady && Boolean(requestedMatchId) && notFound;
  const showLayout = !showNotFound;

  const homeName = match?.home?.name || '';
  const awayName = match?.away?.name || '';
  const pageTitle =
    homeName && awayName ? `${homeName} - ${awayName} | Ofsayt Yok` : 'Maç Detayı | Ofsayt Yok';
  const compName = match?.competition?.name || match?.competition_name || '';
  const pageDescription =
    homeName && awayName
      ? `${homeName} vs ${awayName}${compName ? ` - ${compName}` : ''} maç detayı, istatistikler ve kadro bilgileri.`
      : 'Maç detayı, istatistikler ve kadro bilgileri.';
  const canonicalUrl = `${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}${canonicalPath}`;
  const effectiveMatchId = matchId || requestedMatchId;
  const homeTeamId = match?.home?.id ?? match?.home_id;
  const awayTeamId = match?.away?.id ?? match?.away_id;
  const showStandingsBlock = compId != null || matchLoading;

  if (showNotFound) {
    return (
      <Container>
        <div className={styles.notFound}>Maç bulunamadı.</div>
      </Container>
    );
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        {match?.home?.logo ? (
          <>
            <meta property="og:image" content={match.home.logo} />
            <meta name="twitter:image" content={match.home.logo} />
          </>
        ) : null}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        {match ? (
          <JsonLd
            schema={{
              '@context': 'https://schema.org',
              '@type': 'SportsEvent',
              name: pageTitle,
              url: canonicalUrl,
              sport: 'Soccer',
              ...(match.date ? { startDate: match.date } : {}),
              homeTeam: homeName ? { '@type': 'SportsTeam', name: homeName } : undefined,
              awayTeam: awayName ? { '@type': 'SportsTeam', name: awayName } : undefined,
              ...(compName ? { organizer: { '@type': 'Organization', name: compName } } : {}),
            }}
          />
        ) : null}
      </Head>
      <Container>
        {showLayout ? (
          <div className="layout-split">
            <div className="layout-left">
              <MatchCard match={match} loading={matchLoading} />
              <div className={styles.statsEventsRow}>
                <div className={styles.statsCol}>
                  <MatchStats stats={stats} loading={matchLoading || statsLoading} />
                </div>
                <div className={styles.eventsCol}>
                  <EventTimeline
                    events={events}
                    homeName={match?.home?.name}
                    awayName={match?.away?.name}
                    loading={matchLoading || eventsLoading}
                  />
                </div>
              </div>
              {effectiveMatchId ? <MatchPoll matchId={effectiveMatchId} /> : null}
              <MatchTrivia matchId={effectiveMatchId} match={match} />
              <MatchAnalysis matchId={effectiveMatchId} match={match} />
              <Lineup lineups={lineups} loading={matchLoading || lineupsLoading} />
            </div>
            <div className="layout-right">
              {effectiveMatchId ? <MatchForum matchId={effectiveMatchId} /> : null}
              {showStandingsBlock ? (
                <MatchCompetitionStandings
                  data={standings}
                  loading={standingsLoading || matchLoading}
                  competitionName={match?.competition?.name ?? match?.competition_name}
                  homeTeamId={homeTeamId}
                  awayTeamId={awayTeamId}
                  seasons={seasons}
                  selectedSeasonId={selectedSeasonId}
                  onSeasonChange={
                    compId != null ? (sid) => handleSeasonChange(sid, String(compId)) : undefined
                  }
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </Container>
    </>
  );
}
