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
import { backfillMissingPredictionRecords, evaluatePendingPredictionRecords } from '@/lib/predictionRecords';
import { buildMatchHref } from '@/utils/matchUrl';
import styles from './ai-istatistikleri.module.scss';

type PhaseStats = {
  phase: 'PRE' | 'HT';
  total: number;
  evaluated: number;
  pending: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
  scoreExactHitCount: number;
  scoreExactHitRate: number;
};

type HistoryItem = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  phase: 'PRE' | 'HT';
  predictedHomePct: number;
  predictedDrawPct: number;
  predictedAwayPct: number;
  predictedScore: string;
  actualResult: string | null;
  actualScore: string | null;
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  evaluatedAt: string | null;
  createdAt: string;
};

type PageProps = {
  totalRecords: number;
  totalEvaluated: number;
  pendingCount: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
  scoreExactHitCount: number;
  scoreExactHitRate: number;
  byPhase: PhaseStats[];
  isPremium: boolean;
  isAdmin: boolean;
  history: HistoryItem[];
};

function computePhaseStats(
  rows: {
    result1x2Hit: boolean | null;
    scoreExactHit: boolean | null;
    evaluatedAt: Date | null;
    matchAnalysis: { matchStatus: string };
  }[],
  phase: 'PRE' | 'HT'
): PhaseStats {
  const filtered = rows.filter((r) => r.matchAnalysis.matchStatus === phase);
  const evaluatedRows = filtered.filter((r) => r.evaluatedAt != null);
  const evaluated = evaluatedRows.length;
  const result1x2HitCount = evaluatedRows.filter((r) => r.result1x2Hit === true).length;
  const scoreExactHitCount = evaluatedRows.filter((r) => r.scoreExactHit === true).length;

  return {
    phase,
    total: filtered.length,
    evaluated,
    pending: filtered.length - evaluated,
    result1x2HitCount,
    result1x2HitRate:
      evaluated > 0 ? Math.round((result1x2HitCount / evaluated) * 1000) / 10 : 0,
    scoreExactHitCount,
    scoreExactHitRate:
      evaluated > 0 ? Math.round((scoreExactHitCount / evaluated) * 1000) / 10 : 0,
  };
}

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

  await backfillMissingPredictionRecords();
  await evaluatePendingPredictionRecords(req);

  const allRecords = await prisma.predictionRecord.findMany({
    select: {
      result1x2Hit: true,
      scoreExactHit: true,
      evaluatedAt: true,
      matchId: true,
      predictedHomePct: true,
      predictedDrawPct: true,
      predictedAwayPct: true,
      predictedScore: true,
      actualResult: true,
      actualScore: true,
      createdAt: true,
      matchAnalysis: { select: { matchStatus: true, homeTeamName: true, awayTeamName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalRecords = allRecords.length;
  const evaluated = allRecords.filter((r) => r.evaluatedAt != null);
  const totalEvaluated = evaluated.length;
  const pendingCount = totalRecords - totalEvaluated;

  const result1x2HitCount = evaluated.filter((r) => r.result1x2Hit === true).length;
  const scoreExactHitCount = evaluated.filter((r) => r.scoreExactHit === true).length;

  const byPhase: PhaseStats[] = [
    computePhaseStats(allRecords, 'PRE'),
    computePhaseStats(allRecords, 'HT'),
  ].filter((p) => p.total > 0);

  let history: HistoryItem[] = [];
  if (isPremium) {
    history = allRecords.slice(0, 100).map((r) => ({
      matchId: r.matchId,
      homeTeamName: r.matchAnalysis.homeTeamName,
      awayTeamName: r.matchAnalysis.awayTeamName,
      phase: r.matchAnalysis.matchStatus === 'HT' ? 'HT' : 'PRE',
      predictedHomePct: r.predictedHomePct,
      predictedDrawPct: r.predictedDrawPct,
      predictedAwayPct: r.predictedAwayPct,
      predictedScore: r.predictedScore,
      actualResult: r.actualResult,
      actualScore: r.actualScore,
      result1x2Hit: r.result1x2Hit,
      scoreExactHit: r.scoreExactHit,
      evaluatedAt: r.evaluatedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  const i18nProps = await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'ai']);
  return {
    props: {
      ...i18nProps,
      totalRecords,
      totalEvaluated,
      pendingCount,
      result1x2HitCount,
      result1x2HitRate:
        totalEvaluated > 0 ? Math.round((result1x2HitCount / totalEvaluated) * 1000) / 10 : 0,
      scoreExactHitCount,
      scoreExactHitRate:
        totalEvaluated > 0 ? Math.round((scoreExactHitCount / totalEvaluated) * 1000) / 10 : 0,
      byPhase,
      isPremium: isPremium ?? false,
      isAdmin: isAdmin ?? false,
      history,
    },
  };
};

export default function AiIstatistikleri({
  totalRecords,
  totalEvaluated,
  pendingCount,
  result1x2HitCount,
  result1x2HitRate,
  scoreExactHitCount,
  scoreExactHitRate,
  byPhase,
  isPremium,
  isAdmin,
  history,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation('ai');
  const isEmpty = totalRecords === 0;
  const hasOnlyPending = totalRecords > 0 && totalEvaluated === 0;
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<string>('');

  function resultLabel(r: string | null): string {
    if (r === 'HOME') return t('resultHome');
    if (r === 'DRAW') return t('resultDraw');
    if (r === 'AWAY') return t('resultAway');
    return t('notEvaluated');
  }

  function predictedOutcome(
    home: number,
    draw: number,
    away: number
  ): { label: string; pct: number } {
    const maxPct = Math.max(home, draw, away);
    const label =
      home === maxPct ? t('resultHome') : draw === maxPct ? t('resultDraw') : t('resultAway');
    return { label, pct: maxPct };
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
        if (data.evaluated > 0) {
          setTimeout(() => window.location.reload(), 1200);
        }
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
                {' · '}
                {t('adminTotalRecords')} <strong>{totalRecords}</strong>
              </span>
              <button
                type="button"
                className={styles.adminBtn}
                onClick={runEvaluation}
                disabled={evalLoading || pendingCount === 0}
              >
                {evalLoading ? t('adminRunning') : t('adminEvaluate')}
              </button>
              {evalResult && <span className={styles.adminFeedback}>{evalResult}</span>}
            </div>
          )}

          {isEmpty ? (
            <div className={styles.empty}>
              <p>{t('noDataEmpty')}</p>
              <p className={styles.emptyHint}>{t('noDataEmptyHint')}</p>
            </div>
          ) : (
            <>
              {hasOnlyPending && (
                <div className={styles.pendingBanner}>
                  {t('pendingBanner', { count: pendingCount, total: totalRecords })}
                  {isAdmin && ` ${t('noDataAdmin')}`}
                </div>
              )}

              <div className={styles.statCards}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{totalRecords}</span>
                  <span className={styles.statLabel}>{t('totalRecords')}</span>
                  {pendingCount > 0 && (
                    <span className={styles.statSub}>
                      {t('pendingSub', { pending: pendingCount })}
                    </span>
                  )}
                </div>
                <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
                  <span className={styles.statValue}>
                    {totalEvaluated > 0 ? `${result1x2HitRate}%` : '—'}
                  </span>
                  <span className={styles.statLabel}>{t('result1x2')}</span>
                  <span className={styles.statSub}>
                    {totalEvaluated > 0
                      ? t('result1x2Sub', { hit: result1x2HitCount, total: totalEvaluated })
                      : t('awaitingEvaluation')}
                  </span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>
                    {totalEvaluated > 0 ? `${scoreExactHitRate}%` : '—'}
                  </span>
                  <span className={styles.statLabel}>{t('scoreExact')}</span>
                  <span className={styles.statSub}>
                    {totalEvaluated > 0
                      ? t('scoreExactSub', { hit: scoreExactHitCount, total: totalEvaluated })
                      : t('awaitingEvaluation')}
                  </span>
                </div>
              </div>

              {byPhase.length > 0 && (
                <div className={styles.section}>
                  <h2 className={styles.sectionTitle}>{t('byPhaseTitle')}</h2>
                  <p className={styles.sectionHint}>{t('byPhaseHint')}</p>
                  <div className={styles.phaseGrid}>
                    {byPhase.map((p) => (
                      <div key={p.phase} className={styles.phaseCard}>
                        <h3 className={styles.phaseTitle}>
                          {p.phase === 'PRE' ? t('phasePre') : t('phaseHt')}
                        </h3>
                        <dl className={styles.phaseStats}>
                          <div>
                            <dt>{t('phaseTotal')}</dt>
                            <dd>{p.total}</dd>
                          </div>
                          <div>
                            <dt>{t('phaseEvaluated')}</dt>
                            <dd>{p.evaluated}</dd>
                          </div>
                          <div>
                            <dt>{t('result1x2')}</dt>
                            <dd>
                              {p.evaluated > 0 ? `${p.result1x2HitRate}%` : '—'}
                              {p.evaluated > 0 && (
                                <span className={styles.phaseSub}>
                                  {' '}
                                  ({p.result1x2HitCount}/{p.evaluated})
                                </span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>{t('scoreExact')}</dt>
                            <dd>
                              {p.evaluated > 0 ? `${p.scoreExactHitRate}%` : '—'}
                              {p.evaluated > 0 && (
                                <span className={styles.phaseSub}>
                                  {' '}
                                  ({p.scoreExactHitCount}/{p.evaluated})
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
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
                            <th>{t('colPhase')}</th>
                            <th>{t('col1x2Prediction')}</th>
                            <th>{t('colScorePrediction')}</th>
                            <th>{t('colActualScore')}</th>
                            <th>{t('col1x2')}</th>
                            <th>{t('colScoreHit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[1, 2, 3].map((i) => (
                            <tr key={i}>
                              <td>Takım A — Takım B</td>
                              <td>{t('phasePre')}</td>
                              <td>{t('resultHome')} (55%)</td>
                              <td>2-1</td>
                              <td>2-0</td>
                              <td>{t('hitYes')}</td>
                              <td>{t('hitNo')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className={styles.premiumOverlay}>
                      <p className={styles.premiumMsg}>{t('historyLocked')}</p>
                      <Link href="/premium" className={styles.premiumCta}>
                        {t('upgradePremium')}
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t('colMatch')}</th>
                          <th>{t('colPhase')}</th>
                          <th>{t('col1x2Prediction')}</th>
                          <th>{t('colScorePrediction')}</th>
                          <th>{t('colActualScore')}</th>
                          <th>{t('colActualResult')}</th>
                          <th>{t('col1x2')}</th>
                          <th>{t('colScoreHit')}</th>
                          <th>{t('colStatus')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((item) => {
                          const pred = predictedOutcome(
                            item.predictedHomePct,
                            item.predictedDrawPct,
                            item.predictedAwayPct
                          );
                          const matchHref = buildMatchHref({
                            id: Number(item.matchId),
                            home: { name: item.homeTeamName },
                            away: { name: item.awayTeamName },
                          });
                          const isPending = item.evaluatedAt == null;

                          return (
                            <tr
                              key={`${item.matchId}-${item.phase}-${item.createdAt}`}
                              className={isPending ? styles.rowPending : undefined}
                            >
                              <td className={styles.matchCell}>
                                <Link href={matchHref} className={styles.matchLink}>
                                  <span className={styles.teamName}>{item.homeTeamName}</span>
                                  <span className={styles.vs}>—</span>
                                  <span className={styles.teamName}>{item.awayTeamName}</span>
                                </Link>
                              </td>
                              <td>
                                <span
                                  className={`${styles.phaseBadge} ${
                                    item.phase === 'HT' ? styles.phaseBadgeHt : styles.phaseBadgePre
                                  }`}
                                >
                                  {item.phase === 'PRE' ? t('phasePre') : t('phaseHt')}
                                </span>
                              </td>
                              <td>
                                {pred.label}{' '}
                                <span className={styles.pct}>({pred.pct.toFixed(0)}%)</span>
                              </td>
                              <td className={styles.mono}>{item.predictedScore}</td>
                              <td className={styles.mono}>
                                {item.actualScore ?? t('notEvaluated')}
                              </td>
                              <td>{isPending ? t('notEvaluated') : resultLabel(item.actualResult)}</td>
                              <td>
                                {isPending ? (
                                  t('statusPending')
                                ) : item.result1x2Hit === true ? (
                                  <span className={styles.hit}>{t('hitYes')}</span>
                                ) : item.result1x2Hit === false ? (
                                  <span className={styles.miss}>{t('hitNo')}</span>
                                ) : (
                                  t('notEvaluated')
                                )}
                              </td>
                              <td>
                                {isPending ? (
                                  t('statusPending')
                                ) : item.scoreExactHit === true ? (
                                  <span className={styles.hit}>{t('hitYes')}</span>
                                ) : item.scoreExactHit === false ? (
                                  <span className={styles.miss}>{t('hitNo')}</span>
                                ) : (
                                  t('notEvaluated')
                                )}
                              </td>
                              <td>
                                {isPending ? (
                                  <span className={styles.statusPending}>{t('statusPending')}</span>
                                ) : (
                                  <span className={styles.statusDone}>{t('statusDone')}</span>
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
