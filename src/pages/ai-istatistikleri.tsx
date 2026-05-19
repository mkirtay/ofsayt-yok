import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import Container from '@/components/Container';
import styles from './ai-istatistikleri.module.scss';

type VersionRow = {
  version: string;
  total: number;
  hitCount: number;
  hitRate: number;
};

type HistoryItem = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  predictedHomePct: number;
  predictedDrawPct: number;
  predictedAwayPct: number;
  predictedScore: string;
  actualResult: string | null;
  actualScore: string | null;
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  createdAt: string;
};

type PageProps = {
  totalEvaluated: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
  scoreExactHitCount: number;
  scoreExactHitRate: number;
  byModelVersion: VersionRow[];
  isPremium: boolean;
  isAdmin: boolean;
  pendingCount: number;
  history: HistoryItem[];
};

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res }) => {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.id) {
    return {
      redirect: { destination: '/auth/signin?callbackUrl=/ai-istatistikleri', permanent: false },
    };
  }

  const isAdmin = session.user.role === 'ADMIN';
  const isPremium =
    isAdmin ||
    (session.user.premiumUntil != null && new Date(session.user.premiumUntil) > new Date());

  const pendingCount = await prisma.predictionRecord.count({ where: { evaluatedAt: null } });

  const evaluated = await prisma.predictionRecord.findMany({
    where: { evaluatedAt: { not: null } },
    select: {
      result1x2Hit: true,
      scoreExactHit: true,
      modelVersion: true,
    },
  });

  const totalEvaluated = evaluated.length;
  const result1x2HitCount = evaluated.filter((r) => r.result1x2Hit === true).length;
  const scoreExactHitCount = evaluated.filter((r) => r.scoreExactHit === true).length;

  const versionMap = new Map<string, { total: number; hitCount: number }>();
  for (const r of evaluated) {
    const v = r.modelVersion;
    const entry = versionMap.get(v) ?? { total: 0, hitCount: 0 };
    entry.total += 1;
    if (r.result1x2Hit === true) entry.hitCount += 1;
    versionMap.set(v, entry);
  }

  const byModelVersion: VersionRow[] = Array.from(versionMap.entries()).map(
    ([version, { total, hitCount }]) => ({
      version,
      total,
      hitCount,
      hitRate: total > 0 ? Math.round((hitCount / total) * 1000) / 10 : 0,
    })
  );

  let history: HistoryItem[] = [];
  if (isPremium) {
    const rows = await prisma.predictionRecord.findMany({
      where: { evaluatedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        matchId: true,
        predictedHomePct: true,
        predictedDrawPct: true,
        predictedAwayPct: true,
        predictedScore: true,
        actualResult: true,
        actualScore: true,
        result1x2Hit: true,
        scoreExactHit: true,
        createdAt: true,
        matchAnalysis: { select: { homeTeamName: true, awayTeamName: true } },
      },
    });
    history = rows.map((r) => ({
      matchId: r.matchId,
      homeTeamName: r.matchAnalysis.homeTeamName,
      awayTeamName: r.matchAnalysis.awayTeamName,
      predictedHomePct: r.predictedHomePct,
      predictedDrawPct: r.predictedDrawPct,
      predictedAwayPct: r.predictedAwayPct,
      predictedScore: r.predictedScore,
      actualResult: r.actualResult,
      actualScore: r.actualScore,
      result1x2Hit: r.result1x2Hit,
      scoreExactHit: r.scoreExactHit,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  return {
    props: {
      totalEvaluated,
      result1x2HitCount,
      result1x2HitRate:
        totalEvaluated > 0 ? Math.round((result1x2HitCount / totalEvaluated) * 1000) / 10 : 0,
      scoreExactHitCount,
      scoreExactHitRate:
        totalEvaluated > 0 ? Math.round((scoreExactHitCount / totalEvaluated) * 1000) / 10 : 0,
      byModelVersion,
      isPremium: isPremium ?? false,
      isAdmin: isAdmin ?? false,
      pendingCount,
      history,
    },
  };
};

function resultLabel(r: string | null): string {
  if (r === 'HOME') return 'Ev Sahibi';
  if (r === 'DRAW') return 'Beraberlik';
  if (r === 'AWAY') return 'Deplasman';
  return '—';
}

export default function AiIstatistikleri({
  totalEvaluated,
  result1x2HitCount,
  result1x2HitRate,
  scoreExactHitCount,
  scoreExactHitRate,
  byModelVersion,
  isPremium,
  isAdmin,
  pendingCount,
  history,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const isEmpty = totalEvaluated === 0;
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<string>('');

  async function runEvaluation() {
    setEvalLoading(true);
    setEvalResult('');
    try {
      const res = await fetch('/api/admin/evaluate-predictions', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setEvalResult(`Hata: ${data.error || 'Bilinmeyen hata'}`);
      } else {
        setEvalResult(
          `Tamamlandı: ${data.evaluated} değerlendi, ${data.skipped} atlandı, ${data.errors} hata. Sayfayı yenileyebilirsin.`
        );
      }
    } catch {
      setEvalResult('Bağlantı hatası.');
    } finally {
      setEvalLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>AI Tahmin İstatistikleri — Ofsayt Yok</title>
        <meta
          name="description"
          content="Ofsayt Yok yapay zeka modelinin maç tahmin isabetlilik oranları ve geçmiş tahmin kaydı."
        />
      </Head>

      <Container>
        <div className={styles.page}>
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>AI Tahmin İstatistikleri</h1>
            <p className={styles.heroSub}>
              Yapay zeka modelimizin maç sonucu tahminlerindeki isabetlilik oranları
            </p>
          </div>

          {/* Admin panel */}
          {isAdmin && (
            <div className={styles.adminPanel}>
              <span className={styles.adminBadge}>ADMIN</span>
              <span className={styles.adminInfo}>
                Değerlendirilmeyi bekleyen tahmin: <strong>{pendingCount}</strong>
              </span>
              <button
                type="button"
                className={styles.adminBtn}
                onClick={runEvaluation}
                disabled={evalLoading || pendingCount === 0}
              >
                {evalLoading ? 'Çalışıyor…' : 'Tahminleri Değerlendir'}
              </button>
              {evalResult && (
                <span className={styles.adminFeedback}>{evalResult}</span>
              )}
            </div>
          )}

          {isEmpty ? (
            <div className={styles.empty}>
              Henüz değerlendirilen tahmin bulunmuyor.{isAdmin && pendingCount > 0 && ' Yukarıdaki butona tıklayarak değerlendirmeyi çalıştır.'}
            </div>
          ) : (
            <>
              {/* Hero stat cards */}
              <div className={styles.statCards}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{totalEvaluated}</span>
                  <span className={styles.statLabel}>Değerlendirilen Tahmin</span>
                </div>
                <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
                  <span className={styles.statValue}>{result1x2HitRate}%</span>
                  <span className={styles.statLabel}>1X2 İsabetlilik</span>
                  <span className={styles.statSub}>{result1x2HitCount} / {totalEvaluated} doğru</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{scoreExactHitRate}%</span>
                  <span className={styles.statLabel}>Tam Skor İsabetlilik</span>
                  <span className={styles.statSub}>{scoreExactHitCount} / {totalEvaluated} doğru</span>
                </div>
              </div>

              {/* Model version breakdown */}
              {byModelVersion.length > 1 && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>Model Versiyonları</h2>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th>Tahmin</th>
                          <th>Doğru</th>
                          <th>İsabet %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byModelVersion.map((v) => (
                          <tr key={v.version}>
                            <td className={styles.mono}>{v.version}</td>
                            <td>{v.total}</td>
                            <td>{v.hitCount}</td>
                            <td>
                              <span
                                className={`${styles.badge} ${
                                  v.hitRate >= 50 ? styles.badgeGood : styles.badgeLow
                                }`}
                              >
                                {v.hitRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* History section */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Tahmin Geçmişi</h2>

                {!isPremium ? (
                  <div className={styles.premiumGate}>
                    <div className={styles.premiumGateBlur}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Maç</th>
                            <th>Tahmin</th>
                            <th>Skor Tahmini</th>
                            <th>Gerçek Skor</th>
                            <th>Sonuç</th>
                            <th>İsabet</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[1, 2, 3].map((i) => (
                            <tr key={i}>
                              <td>Takım A — Takım B</td>
                              <td>Ev Sahibi (%55)</td>
                              <td>2-1</td>
                              <td>2-0</td>
                              <td>Ev Sahibi</td>
                              <td>✓</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.premiumOverlay}>
                      <p className={styles.premiumMsg}>
                        Tahmin geçmişini görmek için Premium üyelik gerekiyor.
                      </p>
                      <Link href="/auth/signin" className={styles.premiumCta}>
                        Premium Üye Ol
                      </Link>
                    </div>
                  </div>
                ) : history.length === 0 ? (
                  <p className={styles.emptyHistory}>Henüz değerlendirilen tahmin yok.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Maç</th>
                          <th>1X2 Tahmin</th>
                          <th>Skor Tahmini</th>
                          <th>Gerçek Skor</th>
                          <th>Gerçek Sonuç</th>
                          <th>1X2</th>
                          <th>Skor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((item) => {
                          const maxPct = Math.max(
                            item.predictedHomePct,
                            item.predictedDrawPct,
                            item.predictedAwayPct
                          );
                          const predictedOutcome =
                            item.predictedHomePct === maxPct
                              ? 'Ev Sahibi'
                              : item.predictedDrawPct === maxPct
                              ? 'Beraberlik'
                              : 'Deplasman';
                          return (
                            <tr key={`${item.matchId}-${item.createdAt}`}>
                              <td className={styles.matchCell}>
                                <span className={styles.teamName}>{item.homeTeamName}</span>
                                <span className={styles.vs}>—</span>
                                <span className={styles.teamName}>{item.awayTeamName}</span>
                              </td>
                              <td>
                                {predictedOutcome}{' '}
                                <span className={styles.pct}>
                                  ({maxPct.toFixed(0)}%)
                                </span>
                              </td>
                              <td className={styles.mono}>{item.predictedScore}</td>
                              <td className={styles.mono}>{item.actualScore ?? '—'}</td>
                              <td>{resultLabel(item.actualResult)}</td>
                              <td>
                                {item.result1x2Hit === true ? (
                                  <span className={styles.hit}>✓</span>
                                ) : item.result1x2Hit === false ? (
                                  <span className={styles.miss}>✗</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td>
                                {item.scoreExactHit === true ? (
                                  <span className={styles.hit}>✓</span>
                                ) : item.scoreExactHit === false ? (
                                  <span className={styles.miss}>✗</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Container>
    </>
  );
}
