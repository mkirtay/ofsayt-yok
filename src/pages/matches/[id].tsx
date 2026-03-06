import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";

import EventTimeline from "@/components/EventTimeline";
import Layout from "@/components/Layout";
import Lineup from "@/components/Lineup";
import MatchCard from "@/components/MatchCard";
import {
  getLiveMatches,
  getMatchDetail,
  getTeamsFromMatchesData,
} from "@/services/liveScoreService";
import { startLiveUpdates } from "@/services/realtime/liveUpdates";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setMatchDetail } from "@/store/slices/matchDetailSlice";
import { mergeMatches, setMatches } from "@/store/slices/matchesSlice";
import { setTeams } from "@/store/slices/teamsSlice";
import styles from "./matchDetail.module.scss";

export default function MatchDetailPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const matches = useAppSelector((state) => state.matches.items);
  const { match, events, lineups, stats } = useAppSelector(
    (state) => state.matchDetail
  );

  const miniTimeline = events.slice(0, 3);
  const lineupSummary = lineups.map((lineup) => ({
    teamId: lineup.teamId,
    formation: lineup.formation,
    starters: lineup.startXI.length,
  }));

  useEffect(() => {
    const bootstrap = async () => {
      const data = await getLiveMatches();
      dispatch(setMatches(data));
      const teams = getTeamsFromMatchesData(data);
      dispatch(setTeams(teams));
    };

    if (matches.length === 0) {
      bootstrap();
    }
  }, [dispatch, matches.length]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const matchId = String(router.query.id ?? "");
    if (!matchId) {
      return;
    }

    const selectedMatch = matches.find((item) => item.id === matchId) ?? null;
    const fetchDetail = async () => {
      const detail = await getMatchDetail(matchId);
      dispatch(
        setMatchDetail({
          match: selectedMatch,
          events: detail.events,
          lineups: detail.lineups,
          stats: detail.stats,
        })
      );
    };

    fetchDetail();
  }, [dispatch, matches, router.isReady, router.query.id]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const matchId = String(router.query.id ?? "");
    if (!matchId) {
      return;
    }

    const controller = startLiveUpdates(
      async () => {
        const data = await getLiveMatches();
        dispatch(mergeMatches(data));
        const detail = await getMatchDetail(matchId);
        dispatch(
          setMatchDetail({
            match: data.find((item) => item.id === matchId) ?? null,
            events: detail.events,
            lineups: detail.lineups,
            stats: detail.stats,
          })
        );
        return true;
      },
      {
        initialDelayMs: 15000,
        minDelayMs: 10000,
        maxDelayMs: 45000,
      }
    );

    return () => controller.stop();
  }, [dispatch, router.isReady, router.query.id]);

  return (
    <>
      <Head>
        <title>Match Detail</title>
      </Head>
      <Layout activeNav="live">
        <div className={styles.page}>
          <Link className={styles.back} href="/">
            ← Maç listesi
          </Link>
          {match ? (
            <MatchCard match={match} />
          ) : (
            <p className={styles.empty}>Maç bulunamadı.</p>
          )}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Quick Overview</h2>
            <div className={styles.summaryGrid}>
              {lineupSummary.map((summary) => (
                <div key={summary.teamId} className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Formation</p>
                  <p className={styles.summaryValue}>{summary.formation}</p>
                  <p className={styles.summaryMeta}>
                    Starters: {summary.starters}
                  </p>
                </div>
              ))}
              {miniTimeline.length > 0 && (
                <div className={styles.summaryCard}>
                  <p className={styles.summaryLabel}>Mini timeline</p>
                  <ul className={styles.miniTimeline}>
                    {miniTimeline.map((event, index) => (
                      <li key={`${event.type}-${event.minute}-${index}`}>
                        <span className={styles.miniMinute}>
                          {event.minute}&apos;
                        </span>
                        <span className={styles.miniType}>{event.type}</span>
                        <span className={styles.miniPlayer}>{event.playerName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lineupSummary.length === 0 && miniTimeline.length === 0 && (
                <p className={styles.empty}>Özet bilgisi yok.</p>
              )}
            </div>
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Match Stats</h2>
            <div className={styles.statsGrid}>
              {stats.map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <div className={styles.statValues}>
                    <span>{stat.home}</span>
                    <span className={styles.statDivider}>-</span>
                    <span>{stat.away}</span>
                  </div>
                </div>
              ))}
              {stats.length === 0 && (
                <p className={styles.empty}>İstatistik bulunamadı.</p>
              )}
            </div>
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Olay Akışı</h2>
            <EventTimeline events={events} />
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>İlk 11</h2>
            <Lineup lineups={lineups} />
          </section>
        </div>
      </Layout>
    </>
  );
}
