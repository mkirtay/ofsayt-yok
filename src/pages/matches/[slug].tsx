import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { MatchDetailPageServerPayload } from '@/server/loadMatchDetailInitialData';
import { loadMatchDetailInitialData } from '@/server/loadMatchDetailInitialData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import { buildMatchSlug, parseMatchIdFromParam } from '@/utils/matchUrl';
import styles from './matchDetail.module.scss';

type MatchDetailPageProps = {
  matchId: string;
  canonicalPath: string;
  initialMatchData: MatchDetailPageServerPayload;
};

export default function MatchDetail({
  matchId,
  canonicalPath,
  initialMatchData,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [match, setMatch] = useState<Match | null>(() => initialMatchData.match);
  const [events, setEvents] = useState<MatchEvent[]>(() => initialMatchData.events);
  const [lineups, setLineups] = useState<unknown>(() => initialMatchData.lineups);
  const [stats, setStats] = useState<MatchStatsData | null>(() => initialMatchData.stats);
  const [standings, setStandings] = useState<CompetitionTableData | null>(
    () => initialMatchData.standings
  );
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsReady, setStandingsReady] = useState(
    () => initialMatchData.standings != null
  );
  const [loading, setLoading] = useState(false);
  const [seasons, setSeasons] = useState<SeasonListItem[]>(() => initialMatchData.seasons);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(
    () => initialMatchData.selectedSeasonId
  );

  const skipHydrationFetchOnce = useRef(true);

  const handleSeasonChange = useCallback(async (seasonId: number, competitionIdStr: string) => {
    setSelectedSeasonId(seasonId);
    setStandingsLoading(true);
    const table = await getCompetitionTableFull(competitionIdStr, { season: seasonId });
    setStandings(table);
    setStandingsLoading(false);
  }, []);

  useEffect(() => {
    if (!matchId) return;

    if (skipHydrationFetchOnce.current) {
      skipHydrationFetchOnce.current = false;
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setStandings(null);
      setStandingsLoading(false);
      setStandingsReady(false);

      const [matchEventsRes, lineupsData, statsData] = await Promise.all([
        getMatchWithEvents(matchId),
        getMatchLineups(matchId),
        getMatchStats(matchId),
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

    void fetchData();
  }, [matchId]);

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

  const homeName = match?.home?.name || '';
  const awayName = match?.away?.name || '';
  const pageTitle = homeName && awayName
    ? `${homeName} - ${awayName} | Ofsayt Yok`
    : 'Maç Detayı | Ofsayt Yok';
  const compName = match?.competition?.name || match?.competition_name || '';
  const pageDescription = homeName && awayName
    ? `${homeName} vs ${awayName}${compName ? ` - ${compName}` : ''} maç detayı, istatistikler ve kadro bilgileri.`
    : 'Maç detayı, istatistikler ve kadro bilgileri.';
  const canonicalUrl = `${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}${canonicalPath}`;

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
        <meta property="og:image" content={match?.home?.logo || 'https://ofsaytyok.app/images/logo.svg'} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={match?.home?.logo || 'https://ofsaytyok.app/images/logo.svg'} />
        {match && (
          <JsonLd schema={{
            '@context': 'https://schema.org',
            '@type': 'SportsEvent',
            name: pageTitle,
            url: canonicalUrl,
            sport: 'Soccer',
            ...(match.date ? { startDate: match.date } : {}),
            homeTeam: homeName ? { '@type': 'SportsTeam', name: homeName } : undefined,
            awayTeam: awayName ? { '@type': 'SportsTeam', name: awayName } : undefined,
            ...(compName ? { organizer: { '@type': 'Organization', name: compName } } : {}),
          }} />
        )}
      </Head>
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
          {match && (
            <MatchPoll matchId={matchId} />
          )}
          <MatchTrivia matchId={matchId} match={match} />
          <MatchAnalysis matchId={matchId} match={match} />
          <Lineup lineups={lineups} />
        </div>
        <div className="layout-right">
          <MatchForum matchId={matchId} />
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
    </>
  );
}

export const getServerSideProps: GetServerSideProps<MatchDetailPageProps> = async (ctx) => {
  const rawParam = ctx.params?.slug;
  const param = typeof rawParam === 'string' ? rawParam : Array.isArray(rawParam) ? rawParam[0] : '';
  if (!param) return { notFound: true };

  const matchId = parseMatchIdFromParam(param);
  if (!matchId) return { notFound: true };

  const raw = await loadMatchDetailInitialData(ctx.req, matchId);
  if (!raw?.match) return { notFound: true };

  const canonicalSlug = buildMatchSlug(raw.match);
  const canonicalParam = canonicalSlug ? `${matchId}-${canonicalSlug}` : matchId;

  if (param !== canonicalParam) {
    return {
      redirect: {
        destination: `/matches/${canonicalParam}`,
        permanent: true,
      },
    };
  }

  ctx.res.setHeader(
    'Cache-Control',
    'public, s-maxage=20, stale-while-revalidate=120'
  );

  return {
    props: {
      matchId,
      canonicalPath: `/matches/${canonicalParam}`,
      initialMatchData: propsJsonSafe(raw),
    },
  };
};
