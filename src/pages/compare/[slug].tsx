import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Container from '@/components/Container';
import CompareTeamPicker from '@/components/CompareTeamPicker';
import EmptyState from '@/components/EmptyState';
import { PanelSkeleton } from '@/components/Skeleton';
import { useComparePage } from '@/hooks/useComparePage';
import type { ComparePagePayload } from '@/server/loadComparePageData';
import type { RecentMatchRow } from '@/server/buildMatchAnalysisContext';
import { statBarWidths, type H2HSummary, type StatBarKind } from '@/utils/compareData';
import styles from './compare.module.scss';

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

/** Ortadan bölünmüş bar: sol takım sola (accent-1), sağ takım sağa (accent-2); iki değer sayı olarak da yazılı. */
function StatBar({
  label,
  v1,
  v2,
  t1,
  t2,
  kind,
  format,
  lowerIsBetter,
  neutral,
}: {
  label: string;
  v1: number;
  v2: number;
  t1: string;
  t2: string;
  kind: StatBarKind;
  format: (n: number) => string;
  lowerIsBetter?: boolean;
  /** "Daha iyi" yorumu yok (KTK, beraberlik) → vurgu yok. */
  neutral?: boolean;
}) {
  const w = statBarWidths(v1, v2, kind);
  const better = neutral || v1 === v2 ? null : (v1 > v2) !== Boolean(lowerIsBetter) ? 'v1' : 'v2';
  return (
    <div
      className={styles.statBar}
      role="group"
      aria-label={`${label}: ${t1} ${format(v1)}, ${t2} ${format(v2)}`}
    >
      <div className={styles.statBarHead}>
        <span className={`${styles.statBarVal} ${better === 'v1' ? styles.statBarValBest : ''}`}>{format(v1)}</span>
        <span className={styles.statBarLabel}>{label}</span>
        <span className={`${styles.statBarVal} ${styles.statBarValRight} ${better === 'v2' ? styles.statBarValBest : ''}`}>{format(v2)}</span>
      </div>
      <div className={styles.statBarTrack} aria-hidden="true">
        <div className={styles.statBarHalf}>
          <div className={`${styles.statBarFill} ${styles.fillA}`} style={{ width: `${w.left}%` }} />
        </div>
        <div className={styles.statBarHalf}>
          <div className={`${styles.statBarFill} ${styles.fillB}`} style={{ width: `${w.right}%` }} />
        </div>
      </div>
    </div>
  );
}

function H2HCard({ summary, t1, t2 }: { summary: H2HSummary; t1: string; t2: string }) {
  if (summary.total === 0) {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Karşılıklı Maçlar</h2>
        <EmptyState>Bu iki takım daha önce karşılaşmadı.</EmptyState>
      </div>
    );
  }
  const seg = (n: number) => `${(n / summary.total) * 100}%`;
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Karşılıklı Maçlar</h2>
      <p className={styles.h2hLead}>
        Son {summary.total} karşılaşmada: <strong>{t1}</strong> {summary.team1Wins} galibiyet, {summary.draws} beraberlik,{' '}
        <strong>{t2}</strong> {summary.team2Wins} galibiyet
      </p>
      <div
        className={styles.ratioBar}
        role="img"
        aria-label={`${t1} ${summary.team1Wins} galibiyet, ${summary.draws} beraberlik, ${t2} ${summary.team2Wins} galibiyet`}
      >
        {summary.team1Wins > 0 && (
          <div className={`${styles.ratioSeg} ${styles.fillA}`} style={{ width: seg(summary.team1Wins) }}>{summary.team1Wins}</div>
        )}
        {summary.draws > 0 && (
          <div className={`${styles.ratioSeg} ${styles.fillDraw}`} style={{ width: seg(summary.draws) }}>{summary.draws}</div>
        )}
        {summary.team2Wins > 0 && (
          <div className={`${styles.ratioSeg} ${styles.fillB}`} style={{ width: seg(summary.team2Wins) }}>{summary.team2Wins}</div>
        )}
      </div>
      <div className={styles.legend}>
        <span><i className={`${styles.dot} ${styles.fillA}`} />{t1}</span>
        <span><i className={`${styles.dot} ${styles.fillDraw}`} />Beraberlik</span>
        <span><i className={`${styles.dot} ${styles.fillB}`} />{t2}</span>
      </div>
      <ul className={styles.h2hList}>
        {summary.rows.map((r, i) => {
          const homeIsT1 = r.team1IsHome;
          const winnerSide = r.winner === 'draw' ? null : (r.winner === 'team1') === homeIsT1 ? 'home' : 'away';
          return (
            <li key={i} className={styles.h2hRow}>
              <span className={styles.dateCell}>{r.date ?? '—'}</span>
              <span className={`${styles.h2hTeam} ${winnerSide === 'home' ? styles.h2hWinner : ''}`}>
                <i className={`${styles.dot} ${homeIsT1 ? styles.fillA : styles.fillB}`} />
                {r.homeName}
              </span>
              <span className={styles.scoreCell}>{r.score}</span>
              <span className={`${styles.h2hTeam} ${styles.h2hTeamAway} ${winnerSide === 'away' ? styles.h2hWinner : ''}`}>
                {r.awayName}
                <i className={`${styles.dot} ${homeIsT1 ? styles.fillB : styles.fillA}`} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScorerSide({ scorers, teamName, accent }: { scorers: ComparePagePayload['team1']['topScorers']; teamName: string; accent: 'A' | 'B' }) {
  return (
    <div className={`${styles.scorerSide} ${accent === 'B' ? styles.scorerSideRight : ''}`}>
      <span className={styles.scorerTeam}>
        <i className={`${styles.dot} ${accent === 'A' ? styles.fillA : styles.fillB}`} />
        {teamName}
      </span>
      {scorers.length > 0 ? (
        <ol className={styles.scorerList}>
          {scorers.map((scorer) => (
            <li key={scorer.playerId}>
              <Link href={`/players/${scorer.playerId}`} className={styles.scorerLink} prefetch={false}>
                {scorer.photo ? (
                  <img src={scorer.photo} alt="" className={styles.scorerPhoto} width={40} height={40} loading="lazy" />
                ) : (
                  <span className={`${styles.scorerPhoto} ${styles.scorerPhotoEmpty}`} aria-hidden="true" />
                )}
                <span className={styles.scorerText}>
                  <span className={styles.scorerName}>{scorer.name}</span>
                  <span className={styles.scorerGoals}>{scorer.goals} gol</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <span className={styles.empty}>—</span>
      )}
    </div>
  );
}

type Metrics = ComparePagePayload['team1']['metrics'];
const STAT_ROWS: Array<{ label: string; get: (m: Metrics) => number; kind: StatBarKind; decimals?: boolean; lowerIsBetter?: boolean; neutral?: boolean }> = [
  { label: 'Maç Başı Gol', get: (m) => m.goalsPerMatch, kind: 'count', decimals: true },
  { label: 'Maç Başı Yenen', get: (m) => m.goalsAgainstPerMatch, kind: 'count', decimals: true, lowerIsBetter: true },
  { label: 'Temiz Kapı %', get: (m) => m.cleanSheetRate, kind: 'percent' },
  { label: 'KTK (BTTS) %', get: (m) => m.bttsRate, kind: 'percent', neutral: true },
  { label: 'Ev Galibiyet %', get: (m) => m.homeWinRate, kind: 'percent' },
  { label: 'Deplasman Gal. %', get: (m) => m.awayWinRate, kind: 'percent' },
  { label: 'Galibiyet', get: (m) => m.wins, kind: 'count' },
  { label: 'Beraberlik', get: (m) => m.draws, kind: 'count', neutral: true },
  { label: 'Mağlubiyet', get: (m) => m.losses, kind: 'count', lowerIsBetter: true },
];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export default function ComparePage() {
  const router = useRouter();
  const slugParam = router.query.slug;
  const slugFromPath = router.asPath.match(/^\/compare\/([^/?#]+)/)?.[1] ?? '';
  const slug =
    typeof slugParam === 'string'
      ? slugParam
      : Array.isArray(slugParam)
        ? slugParam[0] ?? slugFromPath
        : slugFromPath;
  const { data, isLoading, isError } = useComparePage(slug, router.isReady || Boolean(slugFromPath));

  return (
    <Container>
      <div className={styles.page}>
        <div className={styles.pickerSection}>
          <h2 className={styles.pickerTitle}>Yeni Karşılaştırma</h2>
          <CompareTeamPicker />
        </div>
        {isLoading ? (
          <>
            <PanelSkeleton rows={3} />
            <PanelSkeleton rows={5} />
            <PanelSkeleton rows={5} />
          </>
        ) : isError || !data ? (
          <div className={styles.empty}>Karşılaştırma verisi bulunamadı.</div>
        ) : (
          <ComparePageContent data={data} />
        )}
      </div>
    </Container>
  );
}

function ComparePageContent({ data }: { data: ComparePagePayload }) {
  const { team1, team2 } = data;

  const last5Team1 = team1.recentMatches.slice(0, 5);
  const last5Team2 = team2.recentMatches.slice(0, 5);

  const title = `${team1.teamName} vs ${team2.teamName} — Karşılaştırma`;

  return (
    <>
      <Head>
        <title>{title} | Ofsayt Yok</title>
        <meta
          name="description"
          content={`${team1.teamName} ile ${team2.teamName} arasındaki H2H istatistikleri, son form ve karşılaştırma.`}
        />
      </Head>

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

          {/* ── Karşılıklı maçlar (H2H) ── */}
          <H2HCard summary={data.h2hSummary} t1={team1.teamName} t2={team2.teamName} />

          {/* ── Sezonun en golcüleri ── */}
          {(team1.topScorers.length > 0 || team2.topScorers.length > 0) && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Sezonun En Golcüleri</h2>
              <div className={styles.scorers}>
                <ScorerSide scorers={team1.topScorers} teamName={team1.teamName} accent="A" />
                <ScorerSide scorers={team2.topScorers} teamName={team2.teamName} accent="B" />
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
              <div className={styles.statLegend}>
                <span><i className={`${styles.dot} ${styles.fillA}`} />{team1.teamName}</span>
                <span>{team2.teamName}<i className={`${styles.dot} ${styles.fillB}`} /></span>
              </div>
              {STAT_ROWS.map((r) => (
                <StatBar
                  key={r.label}
                  label={r.label}
                  v1={r.get(team1.metrics)}
                  v2={r.get(team2.metrics)}
                  t1={team1.teamName}
                  t2={team2.teamName}
                  kind={r.kind}
                  format={r.kind === 'percent' ? pct : r.decimals ? (n) => n.toFixed(2) : (n) => String(n)}
                  lowerIsBetter={r.lowerIsBetter}
                  neutral={r.neutral}
                />
              ))}
            </div>
          )}
    </>
  );
}
