import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useCredits } from '@/hooks/useCredits';
import { deriveMatchPhase } from '@/utils/matchPhase';
import type { Match } from '@/models/liveScore';
import AiLoadingPitch from './AiLoadingPitch';
import HeatmapPitch from './HeatmapPitch';
import styles from './matchAnalysis.module.scss';

const ANALYSIS_COST = 5;

type TacticalProfile = {
  formation: string;
  pressLevel: string;
  transitionStrength: string;
  setPieceThreat: string;
  wingUsage: string;
  defensiveWeakness: string;
};

type FullReport = {
  matchSummary: { tempo: string; dominantSide: string; balanceType: string; homeAwayImpact: string };
  tacticalAnalysis: { home: TacticalProfile; away: TacticalProfile; keyBattleZones: string };
  heatmapAnalysis: {
    homeZones: string;
    awayZones: string;
    narrative: string;
    zoneGrid?: { home: number[]; away: number[] };
  };
  riskFactors: string[];
  analystComment: string;
};

type ApiAnalysis = {
  id: string;
  matchId: string;
  matchStatus: string;
  homeTeamName: string;
  awayTeamName: string;
  matchPrediction: { home: number; draw: number; away: number; reasoning: string };
  scorePrediction: {
    mostLikely: string;
    alternatives: Array<{ score: string; probability: number } | string>;
    reasoning: string;
  };
  goalExpectation: {
    over15: number;
    over25: number;
    over35: number;
    btts: number;
    htOver05: number;
    htOver15: number;
    homeToScore: number;
    awayToScore: number;
    bttsFirstHalf: number;
    reasoning: string;
  };
  bettingTips: Array<{
    market: string;
    pick: string;
    confidence: 'low' | 'medium' | 'high';
    reasoning: string;
    valueBet?: boolean;
    avoid?: boolean;
  }>;
  teamAnalyses: {
    home: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
      firstHalfNote?: string;
      secondHalfNote?: string;
    };
    away: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
      firstHalfNote?: string;
      secondHalfNote?: string;
    };
  };
  fullReport: FullReport | null;
  riskLevel: 'low' | 'medium' | 'high';
  riskReasoning: string;
  confidenceScore: number;
  modelVersion: string;
  createdAt: string;
  updatedAt: string;
};

type ApiPredictionRecord = {
  id: string;
  actualResult: string | null;
  actualScore: string | null;
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  evaluatedAt: string | null;
  extendedHits: Record<string, boolean | null> | null;
};

type Props = {
  matchId: string;
  match: Match | null;
};

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

export default function MatchAnalysis({ matchId, match }: Props) {
  const { t } = useTranslation('match');
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';
  const { credits, refresh: refreshCredits } = useCredits();

  const [analysis, setAnalysis] = useState<ApiAnalysis | null>(null);
  const [predictionRecord, setPredictionRecord] = useState<ApiPredictionRecord | null>(null);
  const [serverPhase, setServerPhase] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notGenerated, setNotGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastFetchedMatchId = useRef<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/analysis`);
      if (res.status === 404) {
        setNotGenerated(true);
        setAnalysis(null);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `İstek başarısız (${res.status})`);
      }
      const body = (await res.json()) as {
        analysis: ApiAnalysis;
        predictionRecord: ApiPredictionRecord | null;
        matchPhase?: string;
      };
      setAnalysis(body.analysis);
      setPredictionRecord(body.predictionRecord ?? null);
      setServerPhase(body.matchPhase ?? null);
      setNotGenerated(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analysis.notGenerated'));
    } finally {
      setLoading(false);
    }
  }, [matchId, t]);

  useEffect(() => {
    if (!matchId || lastFetchedMatchId.current === matchId) return;
    lastFetchedMatchId.current = matchId;
    void fetchAnalysis();
  }, [matchId, fetchAnalysis]);

  const generateAnalysis = useCallback(async () => {
    if (!matchId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/analysis`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? t('analysis.notGenerated'));
        return;
      }
      setAnalysis(body.analysis as ApiAnalysis);
      setPredictionRecord((body.predictionRecord as ApiPredictionRecord) ?? null);
      setNotGenerated(false);
      void refreshCredits();
    } catch {
      setError(t('analysis.notGenerated'));
    } finally {
      setGenerating(false);
    }
  }, [matchId, t, refreshCredits]);

  const phase = serverPhase ?? deriveMatchPhase(match?.status);
  const isPostMatch = phase !== 'PRE';

  if (loading && !analysis) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            {t('analysis.titleShort')}
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
          </h3>
        </div>

        {phase !== 'PRE' ? (
          <div className={styles.errorBox}>{t('analysis.matchStartedNoAnalysis')}</div>
        ) : !isAuthenticated ? (
          <div className={styles.cta}>
            <p className={styles.reasoning}>{t('analysis.signInToGenerate')}</p>
            <Link href="/auth/signin" className={styles.ctaButton}>
              {t('analysis.signIn')}
            </Link>
          </div>
        ) : generating ? (
          <AiLoadingPitch />
        ) : (
          <div className={styles.cta}>
            {error && <div className={styles.errorBox}>{error}</div>}
            <button
              type="button"
              className={styles.ctaButton}
              onClick={() => void generateAnalysis()}
            >
              {t('analysis.generateButton')} {t('analysis.generateCost', { cost: ANALYSIS_COST })}
            </button>
            {error?.toLowerCase().includes('kredi') && (
              <Link href="/credits" className={styles.ctaButton}>
                {t('analysis.buyCredits')}
              </Link>
            )}
            <p className={styles.reasoning}>{t('analysis.creditBalance', { credits })}</p>
          </div>
        )}
      </div>
    );
  }

  const { matchPrediction, scorePrediction, goalExpectation, bettingTips, teamAnalyses, fullReport } =
    analysis;
  const winner =
    matchPrediction.home >= matchPrediction.draw && matchPrediction.home >= matchPrediction.away
      ? 'home'
      : matchPrediction.away >= matchPrediction.draw
        ? 'away'
        : 'draw';

  const hits = predictionRecord?.extendedHits ?? {};
  const isEvaluated = Boolean(predictionRecord?.evaluatedAt);

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>
          <span className={styles.aiBadge}>AI</span>
          {t('analysis.titleShort')}
          {isPostMatch && <span className={styles.preTag}>{t('analysis.preGeneratedTag')}</span>}
        </h3>
        <span className={styles.confidenceBadge}>
          {t('analysis.confidenceBadge', { score: Math.round(analysis.confidenceScore) })}
        </span>
      </div>

      {/* 1. Genel Maç Özeti */}
      {fullReport?.matchSummary && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{t('analysis.matchSummary')}</h4>
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
          <ul className={styles.metaList}>
            <li><strong>{analysis.homeTeamName}:</strong> {fullReport.heatmapAnalysis.homeZones}</li>
            <li><strong>{analysis.awayTeamName}:</strong> {fullReport.heatmapAnalysis.awayZones}</li>
          </ul>
          <p className={styles.narrative}>{fullReport.heatmapAnalysis.narrative}</p>
        </div>
      )}

      {/* Score Prediction */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{t('analysis.scorePrediction')}</h4>
        <div className={styles.scoreRow}>
          <span className={styles.mainScore}>{scorePrediction.mostLikely}</span>
          {scorePrediction.alternatives?.length > 0 && (
            <span className={styles.altScores}>
              {t('analysis.alternative', {
                scores: scorePrediction.alternatives
                  .map((a) => (typeof a === 'string' ? a : `${a.score} (%${a.probability})`))
                  .join(', '),
              })}
            </span>
          )}
        </div>
        <p className={styles.reasoning}>{scorePrediction.reasoning}</p>
        {isEvaluated && (
          <div className={styles.resultRow}>
            <span>{t('analysis.market.exactScore')}</span>
            <ResultBadge hit={predictionRecord?.scoreExactHit} />
          </div>
        )}
      </div>

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
