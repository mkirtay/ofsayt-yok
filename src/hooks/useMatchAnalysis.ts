import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useCredits } from '@/hooks/useCredits';
import { analysisIsFree } from '@/lib/premium';
import type { ApiAnalysis, ApiPredictionRecord } from '@/components/MatchAnalysis/types';
import type { AnalysisPreview } from '@/utils/analysisPreview';
import { pollUntilReady } from '@/hooks/analysisInProgressPoll';

export const ANALYSIS_COST = 1; // = ANALYSIS_UNLOCK_COST (lib/analysisUnlock.ts; istemci paketine sunucu modülü girmesin)

/** Kilitli analizde sunucunun açma teklifi (GET ?v=2 → `offer`; bkz. server/analysisAccess.ts). */
export type AnalysisOffer = {
  cost: number;
  signedIn: boolean;
  balance: number;
  premium: boolean;
  admin: boolean;
  free: boolean;
  weeklyFree: { available: boolean; reason: 'USED' | 'EMAIL_NOT_VERIFIED' | 'ACCOUNT_TOO_NEW' | 'SIGNED_OUT' | null };
};

export type UnlockMethod = 'credit' | 'weekly_free';

export type MatchAnalysisState = {
  analysis: ApiAnalysis | null;
  /** Kredi modeli v2: analiz var ama bu kullanıcıya kilitli → ücretsiz önizleme (SSR'dan da gelir). */
  preview: AnalysisPreview | null;
  locked: boolean;
  offer: AnalysisOffer | null;
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
  /** Analiz yoksa üretir, varsa açar (1 kredi / haftalık hak / premium). */
  generate: (method?: UnlockMethod) => Promise<void>;
};

type GetV2Body =
  | { access: 'unlocked' | 'free'; analysis: ApiAnalysis; predictionRecord: ApiPredictionRecord | null }
  | { access: 'locked'; preview: AnalysisPreview; offer: AnalysisOffer }
  | { access: 'none'; offer: AnalysisOffer };

/**
 * Maç AI analizinin durumu. Maç detayı AÇILDIĞINDA (sekme seçilmeden) çağrılır: böylece
 * AI Analiz sekmesine girildiğinde analiz/kredi durumu hazırdır, kullanıcı beklemez.
 * Analiz yoksa ve kullanıcı giriş yaptıysa kredi bakiyesi de DB'den tazelenir
 * (JWT'deki bakiye bayat olabilir → yetersiz kredi CTA'sı yanlış görünmesin).
 */
export function useMatchAnalysis(
  matchId: string | null | undefined,
  /** Sunucuda (SSR) hazırlanan önizleme — ilk HTML'de kilitli kart görünsün (SEO); istemci yine kişisel durumu çeker. */
  initialPreview: AnalysisPreview | null = null,
): MatchAnalysisState {
  const { t } = useTranslation('match');
  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';
  const { credits, refresh: refreshCredits, apply: applyCredits } = useCredits();
  const unlimited = analysisIsFree({ role: session?.user?.role, premiumUntil: session?.user?.premiumUntil });

  const [analysis, setAnalysis] = useState<ApiAnalysis | null>(null);
  const [preview, setPreview] = useState<AnalysisPreview | null>(initialPreview);
  const [offer, setOffer] = useState<AnalysisOffer | null>(null);
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

  /** Analizin kişisel durumunu uygular (açık → tam analiz, kilitli → önizleme + teklif, yok → üretim teklifi). */
  const applyBody = useCallback((body: GetV2Body) => {
    switch (body.access) {
      case 'locked':
        setAnalysis(null);
        setPredictionRecord(null);
        setPreview(body.preview);
        setOffer(body.offer);
        setNotFound(false);
        return;
      case 'none':
        setAnalysis(null);
        setPredictionRecord(null);
        setPreview(null);
        setOffer(body.offer);
        setNotFound(true);
        return;
      default:
        setAnalysis(body.analysis);
        setPredictionRecord(body.predictionRecord ?? null);
        setPreview(null);
        setOffer(null);
        setNotFound(false);
    }
  }, []);

  const fetchAnalysis = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      setAnalysis(null);
      setPredictionRecord(null);
      setServerPhase(null);
      try {
        // `v=2`: kredi modeli v2 — erişim durumu (açık / kilitli + önizleme / yok) tek yanıtta.
        const res = await fetch(`/api/matches/${id}/analysis?v=2`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? t('common:requestFailed', { status: res.status }));
        }
        applyBody((await res.json()) as GetV2Body);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('analysis.notGenerated'));
      } finally {
        setLoading(false);
      }
    },
    [t, applyBody]
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
      // Başka bir istek üretiyor: analiz kaydedilene kadar yokla (bu kullanıcıya açık ya da kilitli + önizleme döner).
      const outcome = await pollUntilReady(
        async () => {
          const res = await fetch(`/api/matches/${id}/analysis?v=2`);
          if (!res.ok) return null;
          const body = (await res.json()) as GetV2Body;
          return body.access === 'none' ? null : body;
        },
        { isCancelled: () => pollingFor.current !== id },
      );
      if (outcome.status === 'cancelled') return;
      pollingFor.current = null;
      setInProgress(false);
      if (outcome.status === 'ready') applyBody(outcome.value);
      else setError(t('analysis.inProgressSlow'));
      // Kendi isteği kredi düşmedi (409); yine de bakiye ekranla aynı kalsın.
      void refreshCredits();
    },
    [t, refreshCredits, applyBody]
  );

  const generate = useCallback(async (method: UnlockMethod = 'credit') => {
    if (!matchId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/analysis`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method }),
      });
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
      setPreview(null);
      setOffer(null);
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
      preview,
      locked: !analysis && preview != null,
      offer,
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
    [analysis, preview, offer, predictionRecord, serverPhase, loading, generating, inProgress, error, credits, unlimited, isAuthenticated, generate]
  );
}
