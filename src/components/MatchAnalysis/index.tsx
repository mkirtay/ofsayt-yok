import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { ANALYSIS_COST, type MatchAnalysisState } from '@/hooks/useMatchAnalysis';
import { deriveMatchPhase } from '@/utils/matchPhase';
import type { Match } from '@/models/liveScore';
import EmptyState from '@/components/EmptyState';
import AiLoadingPitch from './AiLoadingPitch';
import HeatmapPitch from './HeatmapPitch';
import type { ApiAnalysis } from './types';
import styles from './matchAnalysis.module.scss';

/**
 * heatmapAnalysis.homeZones/awayZones/narrative modelden bazen (talimata
 * rağmen) düz sayı dizisi olarak dönebiliyor — bu durumda React diziyi
 * ayraçsız birleştirip anlamsız bir rakam yığını gösterir (ör. "4555706050...").
 * Sadece gerçek, dolu bir metinse render ediyoruz; değilse satırı atlıyoruz.
 */
function asZoneText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type Props = {
  match: Match | null;
  /** Maç detayı açıldığında üst bileşende başlatılan analiz durumu (bkz. useMatchAnalysis). */
  state: MatchAnalysisState;
};

type PickKey =
  | 'home'
  | 'draw'
  | 'away'
  | 'over15'
  | 'over25'
  | 'over35'
  | 'btts'
  | 'htOver05'
  | 'htOver15'
  | 'homeToScore'
  | 'awayToScore'
  | 'bttsFirstHalf';

/** Maç sonucu + gol pazarlarından en yüksek olasılıklı 3 tahmin (özet başlığındaki pill'ler). */
function pickTopPredictions(analysis: ApiAnalysis): Array<{ key: PickKey; pct: number }> {
  const { matchPrediction: mp, goalExpectation: ge } = analysis;
  const candidates: Array<[PickKey, unknown]> = [
    ['home', mp?.home],
    ['draw', mp?.draw],
    ['away', mp?.away],
    ['over15', ge?.over15],
    ['over25', ge?.over25],
    ['over35', ge?.over35],
    ['btts', ge?.btts],
    ['htOver05', ge?.htOver05],
    ['htOver15', ge?.htOver15],
    ['homeToScore', ge?.homeToScore],
    ['awayToScore', ge?.awayToScore],
    ['bttsFirstHalf', ge?.bttsFirstHalf],
  ];
  return candidates
    .map(([key, v]) => ({ key, pct: Math.round(Number(v)) }))
    .filter((c) => Number.isFinite(c.pct) && c.pct > 0 && c.pct <= 100)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);
}

function ResultBadge({ hit }: { hit: boolean | null | undefined }) {
  const { t } = useTranslation('match');
  if (hit === null || hit === undefined) {
    return <span className={`${styles.resultBadge} ${styles.pending}`}>{t('analysis.pendingResult')}</span>;
  }
  return (
    <span className={`${styles.resultBadge} ${hit ? styles.hitYes : styles.hitNo}`}>
      {hit ? `✓ ${t('analysis.hit')}` : `✗ ${t('analysis.miss')}`}
    </span>
  );
}

export default function MatchAnalysis({ match, state }: Props) {
  const { t } = useTranslation('match');
  const {
    analysis,
    predictionRecord,
    serverPhase,
    loading,
    generating,
    error,
    credits,
    premium,
    isAuthenticated,
    generate: generateAnalysis,
  } = state;
  const insufficientCredits = !premium && credits < ANALYSIS_COST;

  const phase = serverPhase ?? deriveMatchPhase(match?.status);
  const isPostMatch = phase !== 'PRE';

  if (loading && !analysis) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            {t('analysis.titleShort')}
            <span className={styles.premiumBadge}>{t('premiumBadge')}</span>
          </h3>
        </div>
        <div className={styles.loading}>{t('common:loading')}</div>
      </div>
    );
  }

  // Analiz yok
  if (!analysis) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            {t('analysis.titleShort')}
            <span className={styles.premiumBadge}>{t('premiumBadge')}</span>
          </h3>
        </div>

        {phase !== 'PRE' ? (
          <EmptyState>{t('analysis.matchStartedNoAnalysis')}</EmptyState>
        ) : !isAuthenticated ? (
          <div className={styles.cta}>
            <p className={styles.reasoning}>{t('analysis.signInToGenerate')}</p>
            <Link href="/auth/signin" className={styles.ctaButton}>
              {t('analysis.signIn')}
            </Link>
          </div>
        ) : generating ? (
          <AiLoadingPitch />
        ) : insufficientCredits ? (
          <div className={styles.cta}>
            <div className={styles.errorBox}>{t('analysis.insufficientCredits')}</div>
            <Link href="/credits" className={styles.ctaButton}>
              {t('analysis.buyCredits')}
            </Link>
            <p className={styles.reasoning}>
              {t('analysis.creditBalance', { credits })} · {t('analysis.generateCost', { cost: ANALYSIS_COST })}
            </p>
          </div>
        ) : (
          <div className={styles.cta}>
            {error && <div className={styles.errorBox}>{error}</div>}
            <button
              type="button"
              className={styles.ctaButton}
              onClick={() => void generateAnalysis()}
            >
              {t('analysis.generateButton')} {premium ? t('analysis.generateUnlimited') : t('analysis.generateCost', { cost: ANALYSIS_COST })}
            </button>
            {premium ? null : <p className={styles.reasoning}>{t('analysis.creditBalance', { credits })}</p>}
          </div>
        )}
      </div>
    );
  }

  const { matchPrediction, goalExpectation, bettingTips, teamAnalyses, fullReport } =
    analysis;
  const winner =
    matchPrediction.home >= matchPrediction.draw && matchPrediction.home >= matchPrediction.away
      ? 'home'
      : matchPrediction.away >= matchPrediction.draw
        ? 'away'
        : 'draw';

  const topPicks = pickTopPredictions(analysis);
  const hits = predictionRecord?.extendedHits ?? {};
  const isEvaluated = Boolean(predictionRecord?.evaluatedAt);

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>
          <span className={styles.aiBadge}>AI</span>
          {t('analysis.titleShort')}
          <span className={styles.premiumBadge}>{t('premiumBadge')}</span>
          {isPostMatch && <span className={styles.preTag}>{t('analysis.preGeneratedTag')}</span>}
        </h3>
        <span className={styles.confidenceBadge}>
          {t('analysis.confidenceBadge', { score: Math.round(analysis.confidenceScore) })}
        </span>
      </div>

      {/* 1. Genel Maç Özeti */}
      {fullReport?.matchSummary && (
        <div className={styles.section}>
          <div className={styles.summaryHeader}>
            <h4 className={styles.sectionTitle}>{t('analysis.matchSummary')}</h4>
            {topPicks.length > 0 && (
              <ul className={styles.topPicks} aria-label={t('analysis.topPicks')}>
                {topPicks.map((p) => (
                  <li key={p.key} className={styles.topPick}>
                    <span className={styles.topPickLabel}>{t(`analysis.pick.${p.key}`)}</span>
                    <span className={styles.topPickPct}>%{p.pct}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ul className={styles.metaList}>
            <li>{fullReport.matchSummary.tempo}</li>
            <li>{fullReport.matchSummary.dominantSide}</li>
            <li>{fullReport.matchSummary.balanceType}</li>
            <li>{fullReport.matchSummary.homeAwayImpact}</li>
          </ul>
        </div>
      )}

      {/* 7. Maç Sonucu Tahmini (1X2) */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t('analysis.resultPrediction')}</h4>
        <div className={styles.predictionBars}>
          <div className={`${styles.predictionBar} ${winner === 'home' ? styles.winner : ''}`}>
            <div className={styles.barLabel}>1</div>
            <div className={styles.barValue}>%{matchPrediction.home}</div>
            <div className={styles.barTeam}>{analysis.homeTeamName}</div>
          </div>
          <div className={`${styles.predictionBar} ${winner === 'draw' ? styles.winner : ''}`}>
            <div className={styles.barLabel}>X</div>
            <div className={styles.barValue}>%{matchPrediction.draw}</div>
            <div className={styles.barTeam}>{t('analysis.draw')}</div>
          </div>
          <div className={`${styles.predictionBar} ${winner === 'away' ? styles.winner : ''}`}>
            <div className={styles.barLabel}>2</div>
            <div className={styles.barValue}>%{matchPrediction.away}</div>
            <div className={styles.barTeam}>{analysis.awayTeamName}</div>
          </div>
        </div>
        <p className={styles.reasoning}>{matchPrediction.reasoning}</p>
        {isEvaluated && (
          <div className={styles.resultRow}>
            <span>{t('analysis.market.result1x2')}</span>
            <ResultBadge hit={predictionRecord?.result1x2Hit} />
          </div>
        )}
      </div>

      {/* 2. Takım Form Analizi */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t('analysis.teamAnalyses')}</h4>
        <div className={styles.teamGrid}>
          {(['home', 'away'] as const).map((side) => {
            const team = teamAnalyses[side];
            const name = side === 'home' ? analysis.homeTeamName : analysis.awayTeamName;
            return (
              <div key={side} className={styles.teamBlock}>
                <div className={styles.teamName}>
                  {name}
                  <span className={styles.formChip}>{team.formSummary}</span>
                </div>
                <p className={styles.narrative}>{team.narrative}</p>
                {team.keyFactors?.length > 0 && (
                  <ul className={styles.metaList}>
                    {team.keyFactors.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                )}
                {(team.firstHalfNote || team.secondHalfNote) && (
                  <ul className={styles.metaList}>
                    {team.firstHalfNote && <li>1Y: {team.firstHalfNote}</li>}
                    {team.secondHalfNote && <li>2Y: {team.secondHalfNote}</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Taktik Analiz */}
      {fullReport?.tacticalAnalysis && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('analysis.tacticalAnalysis')}</h4>
          <div className={styles.teamGrid}>
            {(['home', 'away'] as const).map((side) => {
              const tac = fullReport.tacticalAnalysis[side];
              const name = side === 'home' ? analysis.homeTeamName : analysis.awayTeamName;
              return (
                <div key={side} className={styles.teamBlock}>
                  <div className={styles.teamName}>{name}</div>
                  <ul className={styles.metaList}>
                    <li><strong>{tac.formation}</strong></li>
                    <li>{tac.pressLevel}</li>
                    <li>{tac.transitionStrength}</li>
                    <li>{tac.setPieceThreat}</li>
                    <li>{tac.wingUsage}</li>
                    <li>{tac.defensiveWeakness}</li>
                  </ul>
                </div>
              );
            })}
          </div>
          <p className={styles.reasoning}>{fullReport.tacticalAnalysis.keyBattleZones}</p>
        </div>
      )}

      {/* 4. Isı Haritası */}
      {fullReport?.heatmapAnalysis && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('analysis.heatmap')}</h4>
          {fullReport.heatmapAnalysis.zoneGrid && (
            <HeatmapPitch
              homeGrid={fullReport.heatmapAnalysis.zoneGrid.home}
              awayGrid={fullReport.heatmapAnalysis.zoneGrid.away}
              homeName={analysis.homeTeamName}
              awayName={analysis.awayTeamName}
            />
          )}
          {(() => {
            const homeZonesText = asZoneText(fullReport.heatmapAnalysis.homeZones);
            const awayZonesText = asZoneText(fullReport.heatmapAnalysis.awayZones);
            const narrativeText = asZoneText(fullReport.heatmapAnalysis.narrative);
            return (
              <>
                {(homeZonesText || awayZonesText) && (
                  <ul className={styles.metaList}>
                    {homeZonesText && <li><strong>{analysis.homeTeamName}:</strong> {homeZonesText}</li>}
                    {awayZonesText && <li><strong>{analysis.awayTeamName}:</strong> {awayZonesText}</li>}
                  </ul>
                )}
                {narrativeText && <p className={styles.narrative}>{narrativeText}</p>}
              </>
            );
          })()}
        </div>
      )}

      {/* 6. Gol Tahmini */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t('analysis.goalExpectation')}</h4>
        <div className={styles.goalGrid}>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.over15')}</div>
            <div className={styles.goalPct}>%{goalExpectation.over15}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.over25')}</div>
            <div className={styles.goalPct}>%{goalExpectation.over25}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.over35')}</div>
            <div className={styles.goalPct}>%{goalExpectation.over35}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.btts')}</div>
            <div className={styles.goalPct}>%{goalExpectation.btts}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.htOver05')}</div>
            <div className={styles.goalPct}>%{goalExpectation.htOver05}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.htOver15')}</div>
            <div className={styles.goalPct}>%{goalExpectation.htOver15}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.homeToScore')}</div>
            <div className={styles.goalPct}>%{goalExpectation.homeToScore}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>{t('analysis.awayToScore')}</div>
            <div className={styles.goalPct}>%{goalExpectation.awayToScore}</div>
          </div>
        </div>
        <p className={styles.reasoning}>{goalExpectation.reasoning}</p>
        {isEvaluated && (
          <div className={styles.resultGrid}>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.over25')}</span>
              <ResultBadge hit={hits.over25Hit} />
            </div>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.btts')}</span>
              <ResultBadge hit={hits.bttsHit} />
            </div>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.over35')}</span>
              <ResultBadge hit={hits.over35Hit} />
            </div>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.htOver05')}</span>
              <ResultBadge hit={hits.htOver05Hit} />
            </div>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.htOver15')}</span>
              <ResultBadge hit={hits.htOver15Hit} />
            </div>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.homeToScore')}</span>
              <ResultBadge hit={hits.homeToScoreHit} />
            </div>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.awayToScore')}</span>
              <ResultBadge hit={hits.awayToScoreHit} />
            </div>
            <div className={styles.resultRow}>
              <span>{t('analysis.market.bttsFirstHalf')}</span>
              <ResultBadge hit={hits.bttsFirstHalfHit} />
            </div>
          </div>
        )}
      </div>

      {/* 8. Bahis / İddia Pazarı Analizi */}
      {bettingTips?.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('analysis.bettingTips')}</h4>
          <div className={styles.tipsList}>
            {bettingTips.map((tip, i) => (
              <div key={i} className={styles.tipRow}>
                <span className={styles.tipMarket}>{tip.market}</span>
                <span className={styles.tipPick}>{tip.pick}</span>
                <span className={`${styles.confidenceChip} ${styles[tip.confidence]}`}>
                  {t(`analysis.confidence.${tip.confidence}`)}
                </span>
                {tip.valueBet && <span className={styles.valueTag}>{t('analysis.valueBet')}</span>}
                {tip.avoid && <span className={styles.avoidTag}>{t('analysis.avoidBet')}</span>}
                <p className={styles.tipReasoning}>{tip.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. Risk */}
      <div className={styles.section}>
        <div className={`${styles.riskBlock} ${styles[analysis.riskLevel]}`}>
          <span className={styles.riskLabel}>{t(`analysis.risk.${analysis.riskLevel}`)}</span>
          <p className={styles.riskText}>{analysis.riskReasoning}</p>
        </div>
        {fullReport?.riskFactors && fullReport.riskFactors.length > 0 && (
          <ul className={styles.metaList}>
            {fullReport.riskFactors.map((f, i) => (
              <li key={i}>• {f}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 11. Analist Yorumu */}
      {fullReport?.analystComment && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('analysis.analystComment')}</h4>
          <p className={styles.narrative}>{fullReport.analystComment}</p>
        </div>
      )}

      {/* Disclaimer */}
      <div className={styles.disclaimer}>{t('analysis.disclaimer')}</div>
    </div>
  );
}
