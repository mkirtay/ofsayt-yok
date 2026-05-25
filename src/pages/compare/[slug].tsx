import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import CompareTeamPicker from '@/components/CompareTeamPicker';
import { loadComparePageData, parseCompareSlug } from '@/server/loadComparePageData';
import { propsJsonSafe } from '@/server/propsJsonSafe';
import type { ComparePagePayload } from '@/server/loadComparePageData';
import type { RecentMatchRow } from '@/server/buildMatchAnalysisContext';
import styles from './compare.module.scss';

type PageProps = { data: ComparePagePayload };

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, params, locale }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const ids = parseCompareSlug(slug);

  if (!ids) return { notFound: true };

  const data = await loadComparePageData(req, ids.team1Id, ids.team2Id).catch(() => null);
  if (!data) return { notFound: true };

  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

  const i18nProps = await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'match']);
  return { props: { ...i18nProps, data: propsJsonSafe(data) } };
};

function FormPill({ result }: { result: RecentMatchRow['result'] }) {
  const map: Record<RecentMatchRow['result'], { label: string; cls: string }> = {
    W: { label: 'G', cls: styles.pillW },
    D: { label: 'B', cls: styles.pillD },
    L: { label: 'M', cls: styles.pillL },
    U: { label: '?', cls: styles.pillU },
  };
  const { label, cls } = map[result];
  return <span className={`${styles.pill} ${cls}`}>{label}</span>;
}

function StatRow({
  label,
  v1,
  v2,
  highlight,
}: {
  label: string;
  v1: string | number;
  v2: string | number;
  highlight?: 'v1' | 'v2' | 'none';
}) {
  return (
    <tr>
      <td className={`${styles.statVal} ${highlight === 'v1' ? styles.statValHighlight : ''}`}>
        {v1}
      </td>
      <td className={styles.statLabel}>{label}</td>
      <td className={`${styles.statVal} ${styles.statValRight} ${highlight === 'v2' ? styles.statValHighlight : ''}`}>
        {v2}
      </td>
    </tr>
  );
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export default function ComparePage({
  data,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { team1, team2, h2h, h2hRaw } = data;

  const last5Team1 = team1.recentMatches.slice(0, 5);
  const last5Team2 = team2.recentMatches.slice(0, 5);

  const h2hLast5 = h2hRaw?.h2h?.slice(0, 5) ?? [];

  const title = `${team1.teamName} vs ${team2.teamName} — Karşılaştırma`;

  function highlightStat(val1: number, val2: number): 'v1' | 'v2' | 'none' {
    if (val1 > val2) return 'v1';
    if (val2 > val1) return 'v2';
    return 'none';
  }

  return (
    <>
      <Head>
        <title>{title} | Ofsayt Yok</title>
        <meta
          name="description"
          content={`${team1.teamName} ile ${team2.teamName} arasındaki H2H istatistikleri, son form ve karşılaştırma.`}
        />
      </Head>

      <Container>
        <div className={styles.page}>
          {/* ── New comparison picker ── */}
          <div className={styles.pickerSection}>
            <h2 className={styles.pickerTitle}>Yeni Karşılaştırma</h2>
            <CompareTeamPicker />
          </div>

          {/* ── Team header ── */}
          <div className={styles.teamHeader}>
            <div className={styles.teamBlock}>
              {team1.teamLogo && (
                <img
                  src={team1.teamLogo}
                  alt=""
                  className={styles.teamLogo}
                  width={48}
                  height={48}
                />
              )}
              <Link href={`/teams/${team1.teamId}`} className={styles.teamName}>
                {team1.teamName}
              </Link>
              <div className={styles.formRow}>
                {last5Team1.map((m, i) => (
                  <FormPill key={i} result={m.result} />
                ))}
              </div>
            </div>

            <div className={styles.vsBlock}>
              <span className={styles.vsText}>VS</span>
              {h2h && (
                <div className={styles.h2hSummary}>
                  <span className={styles.h2hStat} title={`${team1.teamName} galibiyet`}>
                    {h2h.homeWins}
                  </span>
                  <span className={styles.h2hDash}>—</span>
                  <span className={styles.h2hStat} title="Beraberlik">{h2h.draws}</span>
                  <span className={styles.h2hDash}>—</span>
                  <span className={styles.h2hStat} title={`${team2.teamName} galibiyet`}>
                    {h2h.awayWins}
                  </span>
                </div>
              )}
            </div>

            <div className={`${styles.teamBlock} ${styles.teamBlockRight}`}>
              {team2.teamLogo && (
                <img
                  src={team2.teamLogo}
                  alt=""
                  className={styles.teamLogo}
                  width={48}
                  height={48}
                />
              )}
              <Link href={`/teams/${team2.teamId}`} className={styles.teamName}>
                {team2.teamName}
              </Link>
              <div className={styles.formRow}>
                {last5Team2.map((m, i) => (
                  <FormPill key={i} result={m.result} />
                ))}
              </div>
            </div>
          </div>

          {/* ── H2H overview ── */}
          {h2h && h2h.totalMatches > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Yüz Yüze İstatistikler</h2>
              <div className={styles.h2hGrid}>
                <div className={styles.h2hCard}>
                  <span className={styles.h2hBig}>{h2h.totalMatches}</span>
                  <span className={styles.h2hCardLabel}>Toplam Maç</span>
                </div>
                <div className={styles.h2hCard}>
                  <span className={styles.h2hBig}>{h2h.homeWins}</span>
                  <span className={styles.h2hCardLabel}>{team1.teamName} Galibiyet</span>
                </div>
                <div className={styles.h2hCard}>
                  <span className={styles.h2hBig}>{h2h.draws}</span>
                  <span className={styles.h2hCardLabel}>Beraberlik</span>
                </div>
                <div className={styles.h2hCard}>
                  <span className={styles.h2hBig}>{h2h.awayWins}</span>
                  <span className={styles.h2hCardLabel}>{team2.teamName} Galibiyet</span>
                </div>
              </div>

              {/* Dominance bar */}
              <div className={styles.dominanceWrap}>
                <span className={styles.dominanceLabel}>{team1.teamName}</span>
                <div className={styles.dominanceBar}>
                  <div
                    className={styles.dominanceFill}
                    style={{
                      width: `${Math.round(
                        (h2h.homeWins / Math.max(h2h.totalMatches, 1)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <span className={styles.dominanceLabel}>{team2.teamName}</span>
              </div>
              <div className={styles.dominanceGoals}>
                <span>{h2h.goalsHome} gol</span>
                <span className={styles.dominanceGoalsSep}>—</span>
                <span>{h2h.goalsAway} gol</span>
              </div>
            </div>
          )}

          {/* ── Last meetings ── */}
          {h2hLast5.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Son Karşılaşmalar</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Ev Sahibi</th>
                      <th>Skor</th>
                      <th>Deplasman</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2hLast5.map((m, i) => (
                      <tr key={i}>
                        <td className={styles.dateCell}>{m.date ?? '—'}</td>
                        <td>{m.home_name ?? '—'}</td>
                        <td className={styles.scoreCell}>{m.score ?? '—'}</td>
                        <td>{m.away_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Recent form ── */}
          <div className={styles.splitGrid}>
            {/* Team 1 form */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>{team1.teamName} — Son Maçlar</h2>
              {last5Team1.length === 0 ? (
                <p className={styles.empty}>Maç verisi bulunamadı.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>S/D</th>
                        <th>Rakip</th>
                        <th>Skor</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {last5Team1.map((m, i) => (
                        <tr key={i}>
                          <td>{m.isHome ? 'S' : 'D'}</td>
                          <td>{m.opponent}</td>
                          <td className={styles.scoreCell}>{m.scoreText || '—'}</td>
                          <td><FormPill result={m.result} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Team 2 form */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>{team2.teamName} — Son Maçlar</h2>
              {last5Team2.length === 0 ? (
                <p className={styles.empty}>Maç verisi bulunamadı.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>S/D</th>
                        <th>Rakip</th>
                        <th>Skor</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {last5Team2.map((m, i) => (
                        <tr key={i}>
                          <td>{m.isHome ? 'S' : 'D'}</td>
                          <td>{m.opponent}</td>
                          <td className={styles.scoreCell}>{m.scoreText || '—'}</td>
                          <td><FormPill result={m.result} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Stats comparison ── */}
          {(team1.metrics.matchesAnalyzed > 0 || team2.metrics.matchesAnalyzed > 0) && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>İstatistik Karşılaştırması</h2>
              <div className={styles.tableWrap}>
                <table className={styles.statsTable}>
                  <thead>
                    <tr>
                      <th className={styles.statVal}>{team1.teamName}</th>
                      <th className={styles.statLabel}></th>
                      <th className={`${styles.statVal} ${styles.statValRight}`}>{team2.teamName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <StatRow
                      label="Maç Başı Gol"
                      v1={team1.metrics.goalsPerMatch.toFixed(2)}
                      v2={team2.metrics.goalsPerMatch.toFixed(2)}
                      highlight={highlightStat(team1.metrics.goalsPerMatch, team2.metrics.goalsPerMatch)}
                    />
                    <StatRow
                      label="Maç Başı Yenen"
                      v1={team1.metrics.goalsAgainstPerMatch.toFixed(2)}
                      v2={team2.metrics.goalsAgainstPerMatch.toFixed(2)}
                      highlight={
                        team1.metrics.goalsAgainstPerMatch < team2.metrics.goalsAgainstPerMatch
                          ? 'v1'
                          : team2.metrics.goalsAgainstPerMatch < team1.metrics.goalsAgainstPerMatch
                          ? 'v2'
                          : 'none'
                      }
                    />
                    <StatRow
                      label="Temiz Kapı %"
                      v1={pct(team1.metrics.cleanSheetRate)}
                      v2={pct(team2.metrics.cleanSheetRate)}
                      highlight={highlightStat(team1.metrics.cleanSheetRate, team2.metrics.cleanSheetRate)}
                    />
                    <StatRow
                      label="KTK (BTTS) %"
                      v1={pct(team1.metrics.bttsRate)}
                      v2={pct(team2.metrics.bttsRate)}
                      highlight="none"
                    />
                    <StatRow
                      label="Ev Galibiyet %"
                      v1={pct(team1.metrics.homeWinRate)}
                      v2={pct(team2.metrics.homeWinRate)}
                      highlight={highlightStat(team1.metrics.homeWinRate, team2.metrics.homeWinRate)}
                    />
                    <StatRow
                      label="Deplasman Gal. %"
                      v1={pct(team1.metrics.awayWinRate)}
                      v2={pct(team2.metrics.awayWinRate)}
                      highlight={highlightStat(team1.metrics.awayWinRate, team2.metrics.awayWinRate)}
                    />
                    <StatRow
                      label="Galibiyet"
                      v1={team1.metrics.wins}
                      v2={team2.metrics.wins}
                      highlight={highlightStat(team1.metrics.wins, team2.metrics.wins)}
                    />
                    <StatRow
                      label="Beraberlik"
                      v1={team1.metrics.draws}
                      v2={team2.metrics.draws}
                      highlight="none"
                    />
                    <StatRow
                      label="Mağlubiyet"
                      v1={team1.metrics.losses}
                      v2={team2.metrics.losses}
                      highlight={
                        team1.metrics.losses < team2.metrics.losses
                          ? 'v1'
                          : team2.metrics.losses < team1.metrics.losses
                          ? 'v2'
                          : 'none'
                      }
                    />
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
