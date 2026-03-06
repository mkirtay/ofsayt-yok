import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";

import Layout from "@/components/Layout";
import MatchCard from "@/components/MatchCard";
import TeamHeader from "@/components/TeamHeader";
import {
  getLiveMatches,
  getTeamsFromMatchesData,
} from "@/services/liveScoreService";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setMatches } from "@/store/slices/matchesSlice";
import { setTeams } from "@/store/slices/teamsSlice";
import styles from "./teamDetail.module.scss";

export default function TeamDetailPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const matches = useAppSelector((state) => state.matches.items);
  const teams = useAppSelector((state) => state.teams.items);

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

  const teamId = router.isReady ? String(router.query.id ?? "") : "";
  const team = teams.find((item) => item.id === teamId);

  const recentMatches = useMemo(
    () =>
      matches.filter(
        (match) => match.homeTeam.id === teamId || match.awayTeam.id === teamId
      ),
    [matches, teamId]
  );

  return (
    <>
      <Head>
        <title>Team Detail</title>
      </Head>
      <Layout activeNav="live">
        <div className={styles.page}>
          <Link className={styles.back} href="/">
            ← Maç listesi
          </Link>
          {team ? <TeamHeader team={team} /> : <p>Takım bulunamadı.</p>}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Son Maçlar</h2>
            <div className={styles.matches}>
              {recentMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
              {recentMatches.length === 0 && (
                <p className={styles.empty}>Takıma ait maç bulunamadı.</p>
              )}
            </div>
          </section>
        </div>
      </Layout>
    </>
  );
}
