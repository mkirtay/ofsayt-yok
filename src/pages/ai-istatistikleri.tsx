import { useTranslation } from '@/lib/i18n';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Container from '@/components/Container';
import {
  aiStatsDashboardQueryKey,
  useAiStatsDashboard,
} from '@/hooks/useAiStatsDashboard';
import type { AiStatsHistoryItem } from '@/lib/loadAiStatsDashboard';
import { buildMatchHref } from '@/utils/matchUrl';
import styles from './ai-istatistikleri.module.scss';

function SkeletonBar({ width, height = 14 }: { width: string | number; height?: number }) {
  return (
    <div className={styles.skeletonBlock} style={{ width, height }} aria-hidden />
  );
}

function AiStatsPageSkeleton() {
  return (
    <>
      <div className={styles.statCards}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={styles.skeletonStatCard}>
            <SkeletonBar width="40%" height={32} />
            <SkeletonBar width="60%" height={14} />
            <SkeletonBar width="50%" height={12} />
          </div>
        ))}
      </div>
      <div className={styles.section}>
        <SkeletonBar width={180} height={18} />
        <div className={styles.phaseGrid}>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className={styles.skeletonPhaseCard}>
              <SkeletonBar width="35%" height={16} />
              <SkeletonBar width="100%" height={12} />
              <SkeletonBar width="80%" height={12} />
              <SkeletonBar width="90%" height={12} />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.section}>
        <SkeletonBar width={160} height={18} />
        <div className={styles.skeletonTableWrap}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBar key={i} width="100%" height={12} />
          ))}
        </div>
      </div>
    </>
  );
}

export default function AiIstatistikleri() {
  const { t } = useTranslation('ai');
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useAiStatsDashboard();
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState('');

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
      const evalData = await res.json();
      if (!res.ok) {
        setEvalResult(t('evalError', { error: evalData.error || 'Bilinmeyen hata' }));
      } else {
        setEvalResult(
          t('evalDone', {
            evaluated: evalData.evaluated,
            skipped: evalData.skipped,
            errors: evalData.errors,
          })
        );
        if (evalData.evaluated > 0) {
          void queryClient.invalidateQueries({ queryKey: aiStatsDashboardQueryKey });
        }
      }
    } catch {
      setEvalResult(t('evalConnectionError'));
    } finally {
      setEvalLoading(false);
    }
  }

  const totalRecords = data?.totalRecords ?? 0;
  const totalEvaluated = data?.totalEvaluated ?? 0;
  const pendingCount = data?.pendingCount ?? 0;
  const isEmpty = !isLoading && totalRecords === 0;
  const hasOnlyPending = !isLoading && totalRecords > 0 && totalEvaluated === 0;

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

          {isError && (
            <div className={styles.errorBanner}>
              {t('loadError', { defaultValue: 'Veriler yüklenemedi.' })}{' '}
              <button type="button" onClick={() => void refetch()}>
                {t('retry', { defaultValue: 'Tekrar dene' })}
              </button>
            </div>
          )}

          {isLoading ? (
            <AiStatsPageSkeleton />
          ) : data ? (
            <>
              {data.isAdmin && (
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
                      {data.isAdmin && ` ${t('noDataAdmin')}`}
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
                        {totalEvaluated > 0 ? `${data.result1x2HitRate}%` : '—'}
                      </span>
                      <span className={styles.statLabel}>{t('result1x2')}</span>
                      <span className={styles.statSub}>
                        {totalEvaluated > 0
                          ? t('result1x2Sub', {
                              hit: data.result1x2HitCount,
                              total: totalEvaluated,
                            })
                          : t('awaitingEvaluation')}
                      </span>
                    </div>
                    <div className={styles.statCard}>
                      <span className={styles.statValue}>
                        {totalEvaluated > 0 ? `${data.scoreExactHitRate}%` : '—'}
                      </span>
                      <span className={styles.statLabel}>{t('scoreExact')}</span>
                      <span className={styles.statSub}>
                        {totalEvaluated > 0
                          ? t('scoreExactSub', {
                              hit: data.scoreExactHitCount,
                              total: totalEvaluated,
                            })
                          : t('awaitingEvaluation')}
                      </span>
                    </div>
                  </div>

                  {data.byPhase.length > 0 && (
                    <div className={styles.section}>
                      <h2 className={styles.sectionTitle}>{t('byPhaseTitle')}</h2>
                      <p className={styles.sectionHint}>{t('byPhaseHint')}</p>
                      <div className={styles.phaseGrid}>
                        {data.byPhase.map((p) => (
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
                    <HistorySection
                      history={data.history}
                      t={t}
                      resultLabel={resultLabel}
                      predictedOutcome={predictedOutcome}
                    />
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </Container>
    </>
  );
}

function HistorySection({
  history,
  t,
  resultLabel,
  predictedOutcome,
}: {
  history: AiStatsHistoryItem[];
  t: (key: string, opts?: Record<string, unknown>) => string;
  resultLabel: (r: string | null) => string;
  predictedOutcome: (home: number, draw: number, away: number) => { label: string; pct: number };
}) {
  return (
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
                <td className={styles.mono}>{item.actualScore ?? t('notEvaluated')}</td>
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
  );
}
