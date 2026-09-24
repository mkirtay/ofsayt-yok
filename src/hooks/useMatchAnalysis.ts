import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useCredits } from '@/hooks/useCredits';
import { isPremiumUser } from '@/lib/premium';
import type { ApiAnalysis, ApiPredictionRecord } from '@/components/MatchAnalysis/types';

export const ANALYSIS_COST = 5;

export type MatchAnalysisState = {
  analysis: ApiAnalysis | null;
  predictionRecord: ApiPredictionRecord | null;
  serverPhase: string | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  /** Kredi bakiyesi ve premium durumu — "Kredi Satın Al" CTA'sı üretime basmadan görünsün diye. */
  credits: number;
  premium: boolean;
  isAuthenticated: boolean;
  generate: () => Promise<void>;
};

/**
 * Maç AI analizinin durumu. Maç detayı AÇILDIĞINDA (sekme seçilmeden) çağrılır: böylece
 * AI Analiz sekmesine girildiğinde analiz/kredi durumu hazırdır, kullanıcı beklemez.
 * Analiz yoksa ve kullanıcı giriş yaptıysa kredi bakiyesi de DB'den tazelenir
 * (JWT'deki bakiye bayat olabilir → yetersiz kredi CTA'sı yanlış görünmesin).
 */
export function useMatchAnalysis(matchId: string | null | undefined): MatchAnalysisState {
  const { t } = useTranslation('match');
  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';
  const { credits, refresh: refreshCredits } = useCredits();
  const premium = isPremiumUser({ role: session?.user?.role, credits });

  const [analysis, setAnalysis] = useState<ApiAnalysis | null>(null);
  const [predictionRecord, setPredictionRecord] = useState<ApiPredictionRecord | null>(null);
  const [serverPhase, setServerPhase] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(matchId));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const lastFetchedMatchId = useRef<string | null>(null);
  const creditsRefreshedFor = useRef<string | null>(null);

  const fetchAnalysis = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      setAnalysis(null);
      setPredictionRecord(null);
      setServerPhase(null);
      try {
        const res = await fetch(`/api/matches/${id}/analysis`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? t('common:requestFailed', { status: res.status }));
        }
        const body = (await res.json()) as {
          analysis: ApiAnalysis;
          predictionRecord: ApiPredictionRecord | null;
          matchPhase?: string;
        };
        setAnalysis(body.analysis);
        setPredictionRecord(body.predictionRecord ?? null);
        setServerPhase(body.matchPhase ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('analysis.notGenerated'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (!matchId || lastFetchedMatchId.current === matchId) return;
    lastFetchedMatchId.current = matchId;
    void fetchAnalysis(matchId);
  }, [matchId, fetchAnalysis]);

  // Analiz yoksa üretim CTA'sı gösterilecek — bakiyeyi sekmeye girilmeden tazele.
  useEffect(() => {
    if (!matchId || !notFound || !isAuthenticated) return;
    if (creditsRefreshedFor.current === matchId) return;
    creditsRefreshedFor.current = matchId;
    void refreshCredits();
  }, [matchId, notFound, isAuthenticated, refreshCredits]);

  const generate = useCallback(async () => {
    if (!matchId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/analysis`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? t('analysis.notGenerated'));
        if (res.status === 402) void refreshCredits();
        return;
      }
      setAnalysis(body.analysis as ApiAnalysis);
      setPredictionRecord((body.predictionRecord as ApiPredictionRecord) ?? null);
      setNotFound(false);
      void refreshCredits();
    } catch {
      setError(t('analysis.notGenerated'));
    } finally {
      setGenerating(false);
    }
  }, [matchId, t, refreshCredits]);

  return useMemo(
    () => ({
      analysis,
      predictionRecord,
      serverPhase,
      loading,
      generating,
      error,
      credits,
      premium,
      isAuthenticated,
      generate,
    }),
    [analysis, predictionRecord, serverPhase, loading, generating, error, credits, premium, isAuthenticated, generate]
  );
}
