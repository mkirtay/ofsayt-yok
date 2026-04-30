/**
 * Premium kullanıcılar için AI maç analizi paneli.
 *
 * - Premium değilse: blur preview + "Premium'a Geç" CTA
 * - Premium ise: GET /api/matches/[id]/analysis çağrılır,
 *   takım anlatımları, skor tahmini, gol beklentisi, bahis önerileri
 *   ve risk seviyesi gösterilir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePremium } from '@/hooks/usePremium';
import type { Match } from '@/models/liveScore';
import styles from './matchAnalysis.module.scss';

type ApiAnalysis = {
  id: string;
  matchId: string;
  matchStatus: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamNarrative: string;
  awayTeamNarrative: string;
  matchPrediction: {
    home: number;
    draw: number;
    away: number;
    reasoning: string;
  };
  scorePrediction: {
    mostLikely: string;
    alternatives: string[];
    reasoning: string;
  };
  goalExpectation: {
    over15: number;
    over25: number;
    over35: number;
    btts: number;
    reasoning: string;
  };
  bettingTips: Array<{
    market: string;
    pick: string;
    confidence: 'low' | 'medium' | 'high';
    reasoning: string;
  }>;
  teamAnalyses: {
    home: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
    };
    away: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
    };
  };
  riskLevel: 'low' | 'medium' | 'high';
  riskReasoning: string;
  confidenceScore: number;
  modelVersion: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  matchId: string;
  match: Match | null;
};

const RISK_LABEL = { low: 'Düşük Risk', medium: 'Orta Risk', high: 'Yüksek Risk' };
const CONFIDENCE_LABEL = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };

function PreviewSkeleton({ homeName, awayName }: { homeName?: string; awayName?: string }) {
  return (
    <div>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Maç Sonucu Tahmini</h4>
        <div className={styles.predictionBars}>
          <div className={`${styles.predictionBar} ${styles.winner}`}>
            <div className={styles.barLabel}>1</div>
            <div className={styles.barValue}>54%</div>
            <div className={styles.barTeam}>{homeName ?? 'Ev'}</div>
          </div>
          <div className={styles.predictionBar}>
            <div className={styles.barLabel}>X</div>
            <div className={styles.barValue}>26%</div>
          </div>
          <div className={styles.predictionBar}>
            <div className={styles.barLabel}>2</div>
            <div className={styles.barValue}>20%</div>
            <div className={styles.barTeam}>{awayName ?? 'Dep'}</div>
          </div>
        </div>
        <p className={styles.reasoning}>
          Form, ev avantajı ve son karşılaşmalar değerlendirildiğinde...
        </p>
      </div>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Skor Tahmini</h4>
        <div className={styles.scoreRow}>
          <span className={styles.mainScore}>2-1</span>
          <span className={styles.altScores}>Alternatif: 1-1, 2-0</span>
        </div>
      </div>
    </div>
  );
}

export default function MatchAnalysis({ matchId, match }: Props) {
  const { loading: premiumLoading, isPremium } = usePremium();
  const [analysis, setAnalysis] = useState<ApiAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Çoklu istek koruması:
  // - inFlightMatchId: o an istekte olan matchId; aynı id ile tekrar tetiklenirse atlanır.
  // - lastFetchedMatchId: başarılı/başarısız ilk denemede işaretlenir;
  //   React 19 strict-mode çift-mount veya parent re-render'larında ikinci istek gitmesin diye.
  const inFlightMatchId = useRef<string | null>(null);
  const lastFetchedMatchId = useRef<string | null>(null);

  const fetchAnalysis = useCallback(
    async (force = false) => {
      if (!matchId) return;
      if (!force && lastFetchedMatchId.current === matchId) return;
      if (inFlightMatchId.current === matchId) return;

      inFlightMatchId.current = matchId;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/matches/${matchId}/analysis`);
        if (res.status === 401 || res.status === 403) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error ?? 'Bu özellik premium üyelere özeldir.');
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `İstek başarısız (${res.status})`);
        }
        const body = (await res.json()) as { analysis: ApiAnalysis };
        setAnalysis(body.analysis);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analiz alınamadı');
      } finally {
        lastFetchedMatchId.current = matchId;
        inFlightMatchId.current = null;
        setLoading(false);
        setHasFetched(true);
      }
    },
    [matchId]
  );

  useEffect(() => {
    // Premium oturum yüklenmeden veya kullanıcı premium değilse
    // hiçbir analiz isteği atılmaz; bu blur paneli korur ve API maliyetini engeller.
    if (premiumLoading || !isPremium || !matchId) return;
    // Aynı maç için zaten çekildiyse veya halen istekteyse atla.
    if (lastFetchedMatchId.current === matchId) return;
    if (inFlightMatchId.current === matchId) return;
    void fetchAnalysis();
  }, [premiumLoading, isPremium, matchId, fetchAnalysis]);

  if (premiumLoading) {
    return (
      <div className={styles.card}>
        <div className={styles.loading}>Yükleniyor…</div>
      </div>
    );
  }

  // Premium değilse: blur preview + CTA
  if (!isPremium) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            Maç Analizi & Tahmin
          </h3>
        </div>
        <div className={styles.lockedWrap}>
          <div className={styles.lockedPreview}>
            <PreviewSkeleton
              homeName={match?.home?.name}
              awayName={match?.away?.name}
            />
          </div>
          <div className={styles.lockedOverlay}>
            <h4 className={styles.lockedTitle}>🔒 Premium Üyelere Özel</h4>
            <p className={styles.lockedSubtitle}>
              Yapay zeka destekli skor tahmini, takım form analizi ve bahis önerileri için
              Premium üyeliğe geç.
            </p>
            <Link href="/premium" className={styles.ctaButton}>
              Premium&apos;a Geç
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Premium ama henüz yüklenmemiş
  if (loading && !analysis) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            Maç Analizi
          </h3>
        </div>
        <div className={styles.loading}>
          AI analizi hazırlanıyor… Bu işlem birkaç saniye sürebilir.
        </div>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            Maç Analizi
          </h3>
        </div>
        <div className={styles.errorBox}>
          {error}
          {hasFetched && (
            <div>
              <button
                type="button"
                className={styles.generateBtn}
                onClick={() => void fetchAnalysis(true)}
                disabled={loading}
              >
                Tekrar Dene
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const { matchPrediction, scorePrediction, goalExpectation, bettingTips, teamAnalyses } =
    analysis;
  const winner =
    matchPrediction.home >= matchPrediction.draw && matchPrediction.home >= matchPrediction.away
      ? 'home'
      : matchPrediction.away >= matchPrediction.draw
        ? 'away'
        : 'draw';

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>
          <span className={styles.aiBadge}>AI</span>
          Maç Analizi
        </h3>
        <span className={styles.confidenceBadge}>
          Güven: %{Math.round(analysis.confidenceScore)}
        </span>
      </div>

      {/* 1X2 Tahmini */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Maç Sonucu Tahmini</h4>
        <div className={styles.predictionBars}>
          <div
            className={`${styles.predictionBar} ${winner === 'home' ? styles.winner : ''}`}
          >
            <div className={styles.barLabel}>1</div>
            <div className={styles.barValue}>%{matchPrediction.home}</div>
            <div className={styles.barTeam}>{analysis.homeTeamName}</div>
          </div>
          <div
            className={`${styles.predictionBar} ${winner === 'draw' ? styles.winner : ''}`}
          >
            <div className={styles.barLabel}>X</div>
            <div className={styles.barValue}>%{matchPrediction.draw}</div>
            <div className={styles.barTeam}>Beraberlik</div>
          </div>
          <div
            className={`${styles.predictionBar} ${winner === 'away' ? styles.winner : ''}`}
          >
            <div className={styles.barLabel}>2</div>
            <div className={styles.barValue}>%{matchPrediction.away}</div>
            <div className={styles.barTeam}>{analysis.awayTeamName}</div>
          </div>
        </div>
        <p className={styles.reasoning}>{matchPrediction.reasoning}</p>
      </div>

      {/* Takım Analizleri (NARRATIVE) */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Takım Analizleri</h4>
        <div className={styles.teamGrid}>
          <div className={styles.teamBlock}>
            <div className={styles.teamName}>
              {analysis.homeTeamName}
              <span className={styles.formChip}>{teamAnalyses.home.formSummary}</span>
            </div>
            <p className={styles.narrative}>{teamAnalyses.home.narrative}</p>
            {teamAnalyses.home.keyFactors?.length > 0 && (
              <ul className={styles.metaList}>
                {teamAnalyses.home.keyFactors.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.teamBlock}>
            <div className={styles.teamName}>
              {analysis.awayTeamName}
              <span className={styles.formChip}>{teamAnalyses.away.formSummary}</span>
            </div>
            <p className={styles.narrative}>{teamAnalyses.away.narrative}</p>
            {teamAnalyses.away.keyFactors?.length > 0 && (
              <ul className={styles.metaList}>
                {teamAnalyses.away.keyFactors.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Skor Tahmini */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Skor Tahmini</h4>
        <div className={styles.scoreRow}>
          <span className={styles.mainScore}>{scorePrediction.mostLikely}</span>
          {scorePrediction.alternatives?.length > 0 && (
            <span className={styles.altScores}>
              Alternatif: {scorePrediction.alternatives.join(', ')}
            </span>
          )}
        </div>
        <p className={styles.reasoning}>{scorePrediction.reasoning}</p>
      </div>

      {/* Gol Beklentisi */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Gol Beklentisi</h4>
        <div className={styles.goalGrid}>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>Üst 1.5</div>
            <div className={styles.goalPct}>%{goalExpectation.over15}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>Üst 2.5</div>
            <div className={styles.goalPct}>%{goalExpectation.over25}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>Üst 3.5</div>
            <div className={styles.goalPct}>%{goalExpectation.over35}</div>
          </div>
          <div className={styles.goalCell}>
            <div className={styles.goalLabel}>KG Var</div>
            <div className={styles.goalPct}>%{goalExpectation.btts}</div>
          </div>
        </div>
        <p className={styles.reasoning}>{goalExpectation.reasoning}</p>
      </div>

      {/* Bahis Önerileri */}
      {bettingTips?.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Bahis Önerileri</h4>
          <div className={styles.tipsList}>
            {bettingTips.map((tip, i) => (
              <div key={i} className={styles.tipRow}>
                <span className={styles.tipMarket}>{tip.market}</span>
                <span className={styles.tipPick}>{tip.pick}</span>
                <span
                  className={`${styles.confidenceChip} ${styles[tip.confidence]}`}
                >
                  {CONFIDENCE_LABEL[tip.confidence]}
                </span>
                <p className={styles.tipReasoning}>{tip.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk */}
      <div className={styles.section}>
        <div className={`${styles.riskBlock} ${styles[analysis.riskLevel]}`}>
          <span className={styles.riskLabel}>{RISK_LABEL[analysis.riskLevel]}</span>
          <p className={styles.riskText}>{analysis.riskReasoning}</p>
        </div>
      </div>

      {/* Yasal uyarı (zorunlu) */}
      <div className={styles.disclaimer}>
        ⚠️ Bu analiz yapay zeka tarafından üretilmiştir. Bilgi amaçlıdır,
        yatırım veya bahis tavsiyesi değildir. Karar ve sorumluluk kullanıcıya aittir.
      </div>
    </div>
  );
}
