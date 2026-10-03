import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useCredits } from '@/hooks/useCredits';
import { analysisIsFree } from '@/lib/premium';
import type { ApiAnalysis, ApiPredictionRecord } from '@/components/MatchAnalysis/types';
import { pollUntilReady } from '@/hooks/analysisInProgressPoll';

export const ANALYSIS_COST = 5;

export type MatchAnalysisState = {
  analysis: ApiAnalysis | null;
  predictionRecord: ApiPredictionRecord | null;
  serverPhase: string | null;
  loading: boolean;
  generating: boolean;
  /** Analiz başka bir istekte üretiliyor (POST 409): "birkaç saniye içinde hazır" + arka planda yoklama. */
  inProgress?: boolean;
  error: string | null;
  /** Kredi bakiyesi ve kredisiz üretim (yönetici/premium) — "Kredi Satın Al" CTA'sı üretime basmadan görünsün diye. */
  credits: number;
  unlimited: boolean;
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
  const { credits, refresh: refreshCredits, apply: applyCredits } = useCredits();
  const unlimited = analysisIsFree({ role: session?.user?.role, premiumUntil: session?.user?.premiumUntil });

  const [analysis, setAnalysis] = useState<ApiAnalysis | null>(null);
  const [predictionRecord, setPredictionRecord] = useState<ApiPredictionRecord | null>(null);
  const [serverPhase, setServerPhase] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(matchId));
  const [generating, setGenerating] = useState(false);
  const [inProgress, setInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const lastFetchedMatchId = useRef<string | null>(null);
  /** Aktif yoklamanın maçı; maç değişince / bileşen kalkınca yoklama durur. */
  const pollingFor = useRef<string | null>(null);
  useEffect(() => () => {
    pollingFor.current = null;
  }, []);
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
        // `optional=1`: analiz yoksa 200 + `analysis: null` (404 tarayıcı konsolunda hata olarak görünüyordu).
        const res = await fetch(`/api/matches/${id}/analysis?optional=1`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? t('common:requestFailed', { status: res.status }));
        }
        const body = (await res.json()) as {
          analysis: ApiAnalysis | null;
          predictionRecord: ApiPredictionRecord | null;
          matchPhase?: string;
        };
        if (!body.analysis) {
          setNotFound(true);
          return;
        }
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
    // Başka maçın yoklaması sürüyorsa durur (sonucu bu maça yazılmaz).
    pollingFor.current = null;
    setInProgress(false);
    void fetchAnalysis(matchId);
  }, [matchId, fetchAnalysis]);

  // Analiz yoksa üretim CTA'sı gösterilecek — bakiyeyi sekmeye girilmeden tazele.
  useEffect(() => {
    if (!matchId || !notFound || !isAuthenticated) return;
    if (creditsRefreshedFor.current === matchId) return;
    creditsRefreshedFor.current = matchId;
    void refreshCredits();
  }, [matchId, notFound, isAuthenticated, refreshCredits]);

  const waitForOtherGeneration = useCallback(
    async (id: string) => {
      pollingFor.current = id;
      setInProgress(true);
      const outcome = await pollUntilReady(
        async () => {
          const res = await fetch(`/api/matches/${id}/analysis?optional=1`);
          if (!res.ok) return null;
          const body = (await res.json()) as { analysis: ApiAnalysis | null; predictionRecord: ApiPredictionRecord | null };
          return body.analysis ? body : null;
        },
        { isCancelled: () => pollingFor.current !== id },
      );
      if (outcome.status === 'cancelled') return;
      pollingFor.current = null;
      setInProgress(false);
      if (outcome.status === 'ready') {
        setAnalysis(outcome.value.analysis);
        setPredictionRecord(outcome.value.predictionRecord ?? null);
        setNotFound(false);
      } else {
        setError(t('analysis.inProgressSlow'));
      }
      // Kendi isteği kredi düşmedi (409); yine de bakiye ekranla aynı kalsın.
      void refreshCredits();
    },
    [t, refreshCredits]
  );

  const generate = useCallback(async () => {
    if (!matchId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/analysis`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.code === 'ANALYSIS_IN_PROGRESS') {
        setGenerating(false);
        void waitForOtherGeneration(matchId);
        return;
      }
      if (!res.ok) {
        setError(body?.error ?? t('analysis.notGenerated'));
        // 402 (yetersiz), 5xx (iade edildi) — bakiye sunucudakiyle eşitlensin.
        void refreshCredits();
        return;
      }
      setAnalysis(body.analysis as ApiAnalysis);
      setPredictionRecord((body.predictionRecord as ApiPredictionRecord) ?? null);
      setNotFound(false);
      // Sunucu güncel bakiyeyi döndürdüyse ek istek yok; header dahil bütün rozetler anında güncellenir.
      if (typeof body.credits === 'number') applyCredits(body.credits);
      else void refreshCredits();
    } catch {
      setError(t('analysis.notGenerated'));
      void refreshCredits();
    } finally {
      setGenerating(false);
    }
  }, [matchId, t, refreshCredits, applyCredits, waitForOtherGeneration]);

  return useMemo(
    () => ({
      analysis,
      predictionRecord,
      serverPhase,
      loading,
      generating,
      inProgress,
      error,
      credits,
      unlimited,
      isAuthenticated,
      generate,
    }),
    [analysis, predictionRecord, serverPhase, loading, generating, inProgress, error, credits, unlimited, isAuthenticated, generate]
  );
}
