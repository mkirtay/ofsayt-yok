import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { serverSideTranslations } from '@/lib/serverSideTranslations';
import { useTranslation } from '@/lib/i18n';
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

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, locale }) => {
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

  const i18nProps = await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'ai']);
  return {
    props: {
      ...i18nProps,
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
  const { t } = useTranslation('ai');
  const isEmpty = totalEvaluated === 0;
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<string>('');

  function resultLabel(r: string | null): string {
    if (r === 'HOME') return t('resultHome');
    if (r === 'DRAW') return t('resultDraw');
    if (r === 'AWAY') return t('resultAway');
    return t('notEvaluated');
  }

  async function runEvaluation() {
    setEvalLoading(true);
    setEvalResult('');
    try {
      const res = await fetch('/api/admin/evaluate-predictions', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setEvalResult(t('evalError', { error: data.error || 'Bilinmeyen hata' }));
      } else {
        setEvalResult(
          t('evalDone', { evaluated: data.evaluated, skipped: data.skipped, errors: data.errors })
        );
      }
    } catch {
      setEvalResult(t('evalConnectionError'));
    } finally {
      setEvalLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/ai-istatistikleri`} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/ai-istatistikleri`} />
        <meta property="og:image" content={`${process.env.AUTH_URL ?? 'https://ofsaytyok.app'}/images/logo.svg`} />
      </Head>

      <Container>
        <div className={styles.page}>
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>{t('heroTitle')}</h1>
            <p className={styles.heroSub}>{t('heroSub')}</p>
          </div>

          {isAdmin && (
            <div className={styles.adminPanel}>
              <span className={styles.adminBadge}>{t('adminBadge')}</span>
              <span className={styles.adminInfo}>
                {t('adminPending')} <strong>{pendingCount}</strong>
              </span>
              <button
                type="button"
                className={styles.adminBtn}
                onClick={runEvaluation}
                disabled={evalLoading || pendingCount === 0}
              >
                {evalLoading ? t('adminRunning') : t('adminEvaluate')}
              </button>
              {evalResult && (
                <span className={styles.adminFeedback}>{evalResult}</span>
              )}
            </div>
          )}

          {isEmpty ? (
            <div className={styles.empty}>
              {t('noData')}{isAdmin && pendingCount > 0 && ` ${t('noDataAdmin')}`}
            </div>
          ) : (
            <>
              <div className={styles.statCards}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{totalEvaluated}</span>
                  <span className={styles.statLabel}>{t('totalEvaluated')}</span>
                </div>
                <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
                  <span className={styles.statValue}>{result1x2HitRate}%</span>
                  <span className={styles.statLabel}>{t('result1x2')}</span>
                  <span className={styles.statSub}>{t('result1x2Sub', { hit: result1x2HitCount, total: totalEvaluated })}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{scoreExactHitRate}%</span>
                  <span className={styles.statLabel}>{t('scoreExact')}</span>
                  <span className={styles.statSub}>{t('scoreExactSub', { hit: scoreExactHitCount, total: totalEvaluated })}</span>
                </div>
              </div>

              {byModelVersion.length > 1 && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>{t('modelVersions')}</h2>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t('colModel')}</th>
                          <th>{t('colPredictions')}</th>
                          <th>{t('colCorrect')}</th>
                          <th>{t('colAccuracy')}</th>
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

              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t('historyTitle')}</h2>

                {!isPremium ? (
                  <div className={styles.premiumGate}>
                    <div className={styles.premiumGateBlur}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>{t('colMatch')}</th>
                            <th>{t('colPrediction')}</th>
                            <th>{t('colScorePrediction')}</th>
                            <th>{t('colActualScore')}</th>
                            <th>{t('colResult')}</th>
                            <th>{t('colHit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[1, 2, 3].map((i) => (
                            <tr key={i}>
                              <td>Takım A — Takım B</td>
                              <td>{t('resultHome')} (55%)</td>
                              <td>2-1</td>
                              <td>2-0</td>
                              <td>{t('resultHome')}</td>
                              <td>{t('hitYes')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.premiumOverlay}>
                      <p className={styles.premiumMsg}>{t('historyLocked')}</p>
                      <Link href="/auth/signin" className={styles.premiumCta}>
                        {t('upgradePremium')}
                      </Link>
                    </div>
                  </div>
                ) : history.length === 0 ? (
                  <p className={styles.emptyHistory}>{t('noData')}</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t('colMatch')}</th>
                          <th>{t('col1x2Prediction')}</th>
                          <th>{t('colScorePrediction')}</th>
                          <th>{t('colActualScore')}</th>
                          <th>{t('colActualResult')}</th>
                          <th>{t('col1x2')}</th>
                          <th>{t('colScoreHit')}</th>
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
                              ? t('resultHome')
                              : item.predictedDrawPct === maxPct
                              ? t('resultDraw')
                              : t('resultAway');
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
                              <td className={styles.mono}>{item.actualScore ?? t('notEvaluated')}</td>
                              <td>{resultLabel(item.actualResult)}</td>
                              <td>
                                {item.result1x2Hit === true ? (
                                  <span className={styles.hit}>{t('hitYes')}</span>
                                ) : item.result1x2Hit === false ? (
                                  <span className={styles.miss}>{t('hitNo')}</span>
                                ) : (
                                  t('notEvaluated')
                                )}
                              </td>
                              <td>
                                {item.scoreExactHit === true ? (
                                  <span className={styles.hit}>{t('hitYes')}</span>
                                ) : item.scoreExactHit === false ? (
                                  <span className={styles.miss}>{t('hitNo')}</span>
                                ) : (
                                  t('notEvaluated')
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
