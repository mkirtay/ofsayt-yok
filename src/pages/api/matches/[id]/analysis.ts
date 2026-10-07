/**
 * /api/matches/[id]/analysis — kredi modeli v2 (docs/kredi-modeli-v2-plan.md).
 *
 * Erişim: her kullanıcı analizi kendisi için açar (1 kredi / haftalık ücretsiz / premium / yönetici); açtığı kalıcı açık.
 * Maç bitince analiz herkese açık. Diğer herkes yalnız önizlemeyi (kısa özet + ana olasılık) görür — kilitli alanlar
 * hiçbir yanıtta yok. Kural: server/analysisAccess.ts, açma: lib/analysisUnlock.ts.
 *
 * GET (oturuma duyarlı, `Cache-Control: private, no-store`; maç sağlayıcısına yalnız "maç bitti mi" için önbellekli istek)
 *   - `?v=2` (web, yeni mobil): 200 `{ access: 'unlocked' | 'free', analysis, predictionRecord }`,
 *     `{ access: 'locked', preview, offer }` ya da analiz yoksa `{ access: 'none', offer }`.
 *   - Eski istemci (parametresiz; yayınlanmamış eski mobil): erişim varsa bugünkü şekil `{ analysis, predictionRecord }`,
 *     yoksa 404 (uygulama "Analiz et" gösterir; POST 1 krediyle açar). `?optional=1` → 404 yerine `{ analysis: null }`.
 * POST `{ method?: 'credit' | 'weekly_free' }` (gövdesiz = credit; eski istemciyle uyumlu)
 *   - Analiz hazırsa açar: zaten açık / maç bitmiş → ücretsiz; premium / yönetici → ücretsiz açma; haftalık hak;
 *     1 kredi (tek işlem). Haftalık hak kullanılmışsa 409 WEEKLY_FREE_USED, uygun değilse 403 WEEKLY_FREE_NOT_ELIGIBLE.
 *   - Analiz yoksa üretir (yalnız maç başlamadan): maç başına Redis üretim kilidi (ce48734) → başka üretim sürüyorsa kredi
 *     ayrılmadan 409 ANALYSIS_IN_PROGRESS; 1 kredi ayrılır (PENDING) → AI → kayıt → açma + kesinleştirme; AI / kayıt hatasında
 *     aynı istekte iade. Haftalık hak üretimde kullanılamaz (409 WEEKLY_FREE_NOT_READY). Kilit yokken (Redis kapalı) yarışı
 *     DB'de kaybeden de ödediği için açar, iade yok (karar 6).
 *   - Cevap şekli eskisiyle aynı + `unlock: { source, charged }` ve güncel bakiye `credits` (de9ab20: header rozeti).
 * Sportmonks geçici hatası (zaman aşımı, 5xx) → 503, kredi düşülmez.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { MatchAnalysis, PredictionRecord } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { getRequestAuth } from '@/lib/mobileAuth';
import {
  DuplicateSpendError,
  InsufficientCreditsError,
  analysisIdempotencyKey,
  isUniqueViolation,
  refundCredits,
  refundStalePendingSpends,
  reserveCredits,
  settleCredits,
  type CreditReservation,
} from '@/lib/credits';
import {
  ANALYSIS_UNLOCK_COST,
  WeeklyFreeNotEligibleError,
  WeeklyFreeUsedError,
  findUnlock,
  recordGenerationUnlock,
  unlockAsPrivileged,
  unlockWithCredit,
  unlockWithWeeklyFree,
  weeklyFreeIneligibility,
  type UnlockResult,
} from '@/lib/analysisUnlock';
import { isAdminUser, isPremiumUser } from '@/lib/premium';
import { toPublicAnalysis } from '@/utils/analysisScenarios';
import { buildAnalysisPreview } from '@/utils/analysisPreview';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { buildOffer, isAnalysisMatchFinished, loadViewer, type AnalysisViewer } from '@/server/analysisAccess';
import { generateMatchAnalysis, AnalysisTimeoutError } from '@/services/aiAnalysisService';
import { LlmBudgetExceededError } from '@/server/llmBudget';
import { captureError } from '@/lib/logger';
import { ensurePredictionRecordForAnalysis } from '@/lib/predictionRecords';
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';
import { saveGeneratedAnalysis } from '@/server/saveMatchAnalysis';
import { acquireAnalysisLock, releaseAnalysisLock } from '@/lib/analysisGenerationLock';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';

type Result = { status: number; body: Record<string, unknown> };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const matchId = Array.isArray(id) ? id[0] : id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId zorunlu' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, matchId);
  }
  if (req.method === 'POST') {
    return handlePost(req, res, matchId);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function predictionRecordOf(analysis: MatchAnalysis): Promise<PredictionRecord | null> {
  return prisma.predictionRecord.findUnique({ where: { matchAnalysisId: analysis.id } });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, matchId: string) {
  res.setHeader('Cache-Control', 'private, no-store');
  const v2 = req.query.v === '2';
  try {
    const auth = await getRequestAuth(req, res);
    const viewer = await loadViewer(auth?.id);
    // Maç verisi olmadan yalnız id ile arama (takım çifti yedeği yok: Sportmonks id'leri kalıcı).
    const stored = await findStoredMatchAnalysis(matchId, 'PRE');
    if (!stored) {
      if (v2) return res.status(200).json({ access: 'none', offer: await buildOffer(viewer) });
      if (req.query.optional === '1') return res.status(200).json({ analysis: null, predictionRecord: null });
      return res.status(404).json({ error: 'Bu maç için analiz üretilmedi.' });
    }

    const predictionRecord = await predictionRecordOf(stored);
    const unlock = viewer ? await findUnlock(viewer.id, stored.id) : null;
    const access = unlock ? 'unlocked' : (await isAnalysisMatchFinished(stored, predictionRecord)) ? 'free' : 'locked';

    if (access !== 'locked') {
      return res.status(200).json({
        ...(v2 ? { access, unlockSource: unlock?.source ?? null } : {}),
        analysis: toPublicAnalysis(stored),
        predictionRecord,
      });
    }
    if (!v2) {
      // Eski istemci: kilitli analiz "henüz yok" gibi → "Analiz et" düğmesi; POST onu 1 krediyle açar.
      if (req.query.optional === '1') return res.status(200).json({ analysis: null, predictionRecord: null });
      return res.status(404).json({ error: 'Bu maçın analizi kilitli.', code: 'ANALYSIS_LOCKED' });
    }
    return res.status(200).json({ access: 'locked', preview: buildAnalysisPreview(stored), offer: await buildOffer(viewer) });
  } catch (err) {
    captureError('analysis-get', err);
    return res.status(500).json({ error: 'Analiz getirilemedi.' });
  }
}

function fullResponse(
  analysis: MatchAnalysis,
  predictionRecord: PredictionRecord | null,
  extra: { cached: boolean; isPostMatch: boolean; isArchived?: boolean; unlock: UnlockResult | null; credits: number | null },
): Result {
  return {
    status: 200,
    body: {
      analysis: toPublicAnalysis(analysis),
      predictionRecord,
      cached: extra.cached,
      isPostMatch: extra.isPostMatch,
      isArchived: extra.isArchived ?? false,
      unlock: extra.unlock ? { source: extra.unlock.source, charged: extra.unlock.charged } : null,
      // Güncel bakiye: istemci header rozetini ek istek atmadan günceller (de9ab20).
      ...(extra.credits != null ? { credits: extra.credits } : {}),
    },
  };
}

const IN_PROGRESS: Result = {
  status: 409,
  body: { error: 'Bu maçın analizi şu an üretiliyor. Birazdan hazır olacak.', code: 'ANALYSIS_IN_PROGRESS' },
};

/**
 * Hazır analizi açar (ya da zaten açık / bitmiş maçta ücretsiz döner). `postMatch` biliniyorsa (bağlam kurulduysa)
 * verilir; yoksa erişim kuralı sorar.
 */
async function openStored(
  viewer: AnalysisViewer,
  analysis: MatchAnalysis,
  method: 'credit' | 'weekly_free',
  opts: { postMatch?: boolean; isArchived?: boolean } = {},
): Promise<Result> {
  const predictionRecord = await predictionRecordOf(analysis);
  const existing = await findUnlock(viewer.id, analysis.id);
  const finished = opts.postMatch ?? (existing ? false : await isAnalysisMatchFinished(analysis, predictionRecord));
  const base = { cached: true, isPostMatch: opts.postMatch ?? finished, isArchived: opts.isArchived };
  if (existing) {
    const unlock: UnlockResult = {
      unlockId: existing.id,
      source: existing.source as UnlockResult['source'],
      charged: false,
      created: false,
      balanceAfter: null,
    };
    return fullResponse(analysis, predictionRecord, { ...base, unlock, credits: viewer.credits });
  }
  if (finished) return fullResponse(analysis, predictionRecord, { ...base, unlock: null, credits: viewer.credits });

  const ref = { id: analysis.id, matchId: analysis.matchId };
  let unlock: UnlockResult;
  if (isAdminUser(viewer)) unlock = await unlockAsPrivileged(viewer.id, ref, 'ADMIN');
  else if (isPremiumUser(viewer)) unlock = await unlockAsPrivileged(viewer.id, ref, 'PREMIUM');
  else if (method === 'weekly_free') {
    const reason = weeklyFreeIneligibility(viewer);
    if (reason) throw new WeeklyFreeNotEligibleError(reason);
    unlock = await unlockWithWeeklyFree(viewer.id, ref);
  } else {
    try {
      unlock = await unlockWithCredit(viewer.id, ref);
    } catch (e) {
      // Aynı kullanıcının bu maç için süren bir üretimi var (PENDING) → bitmesini beklesin.
      if (e instanceof DuplicateSpendError) return IN_PROGRESS;
      throw e;
    }
  }
  return fullResponse(analysis, predictionRecord, { ...base, unlock, credits: unlock.balanceAfter ?? viewer.credits });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, matchId: string) {
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;

  // Redis kesintisinde instance içi yedek sayaç (LLM ucu sınırsız kalmasın).
  const rl = await hitFixedWindowRateLimit(`analysis:user:${guard.userId}`, 30, 60 * 60_000, { memoryFallback: true });
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Saatlik analiz limitine (30) ulaştınız. Biraz bekleyin.' });
  }

  const rawMethod = (req.body as { method?: unknown } | undefined)?.method;
  const method: 'credit' | 'weekly_free' = rawMethod === 'weekly_free' ? 'weekly_free' : 'credit';

  try {
    const viewer = await loadViewer(guard.userId);
    if (!viewer) return res.status(401).json({ error: 'Oturum geçersiz.' });

    const result = await (async (): Promise<Result> => {
      // Hazır analiz: maç bağlamı (≈14 Sportmonks okuması) hiç kurulmaz.
      const stored = await findStoredMatchAnalysis(matchId, 'PRE');
      if (stored) return openStored(viewer, stored, method);

      const tracked = await trackSportmonksFetches(() => buildMatchAnalysisContext(matchId));
      const ctx = tracked.value;
      // Sportmonks geçici hatası (zaman aşımı / 5xx / 429): "maç yok" ya da "arşiv" sanılmasın → 503.
      if (tracked.failed && (!ctx || ctx.archived)) {
        return {
          status: 503,
          body: { error: 'Maç verisi şu an alınamıyor. Lütfen biraz sonra tekrar deneyin.', code: 'UPSTREAM_UNAVAILABLE' },
        };
      }
      if (!ctx) return { status: 404, body: { error: 'Maç bulunamadı' } };

      // Kanonik id ile tekrar ara (rota parametresi farklı olabilir); takım çifti yedeği yok.
      const existing = await findStoredMatchAnalysis(ctx.archived ? matchId : String(ctx.match.id), 'PRE');
      if (existing) {
        return openStored(viewer, existing, method, {
          postMatch: ctx.archived ? true : ctx.matchPhase === 'POST',
          isArchived: ctx.archived,
        });
      }

      if (ctx.archived) {
        return { status: 409, body: { error: 'Bu maç artık canlı veri sağlayıcısında bulunmuyor; yeni analiz üretilemez.' } };
      }
      if (ctx.matchPhase !== 'PRE') {
        return { status: 409, body: { error: 'Bu maç başladığı için yeni analiz üretilemiyor.' } };
      }
      if (method === 'weekly_free') {
        return {
          status: 409,
          body: {
            error: 'Haftalık ücretsiz açma yalnız hazır analizlerde kullanılabilir. Bu maçın analizi 1 krediyle üretilir.',
            code: 'WEEKLY_FREE_NOT_READY',
          },
        };
      }

      // Maç başına üretim kilidi: başka bir kullanıcı ya da maç öncesi cron aynı maçı şu an üretiyorsa kredi
      // rezerve edilmeden "üretiliyor" döner (bkz. lib/analysisGenerationLock.ts).
      const lock = await acquireAnalysisLock(String(ctx.match.id));
      if (!lock) return IN_PROGRESS;
      try {
        const privileged = isAdminUser(viewer) ? 'ADMIN' : isPremiumUser(viewer) ? 'PREMIUM' : null;
        let reservation: CreditReservation | null = null;
        if (!privileged) {
          // Bu kullanıcının yarım kalmış eski harcaması varsa önce iade (aynı maçın tekrar anahtarını da serbest bırakır).
          try {
            await refundStalePendingSpends({ userId: viewer.id });
          } catch (e) {
            captureError('analysis-stale-refund', e);
          }
          try {
            reservation = await reserveCredits(viewer.id, ANALYSIS_UNLOCK_COST, {
              type: 'ANALYSIS_SPEND',
              matchId,
              idempotencyKey: analysisIdempotencyKey(matchId),
              note: 'Analiz üretimi',
            });
          } catch (e) {
            if (!(e instanceof DuplicateSpendError)) throw e;
            // Aynı kullanıcı bu maç için zaten ödedi: tamamlandıysa açık, sürüyorsa bekletilir.
            const done = await findStoredMatchAnalysis(String(ctx.match.id), 'PRE');
            if (done) return openStored(viewer, done, 'credit', { postMatch: false });
            return IN_PROGRESS;
          }
        }

        const refund = async (reason: string) => {
          if (!reservation) return;
          try {
            await refundCredits(reservation.id, reason);
          } catch (e) {
            // İade yazılamadı (DB): harcama PENDING kalır → eşik sonrası otomatik iade.
            captureError('analysis-refund', e);
          }
        };

        let saved: MatchAnalysis;
        let cached = false;
        try {
          const ai = await generateMatchAnalysis(ctx);
          saved = await saveGeneratedAnalysis(ctx, ai);
        } catch (err) {
          const winner = isUniqueViolation(err) ? await findStoredMatchAnalysis(String(ctx.match.id), 'PRE') : null;
          if (!winner) {
            await refund(err instanceof AnalysisTimeoutError ? 'AI analizi zaman aşımı' : err instanceof LlmBudgetExceededError ? 'AI aylık bütçesi doldu' : 'AI analizi üretilemedi');
            throw err;
          }
          // Kilit devre dışıyken (Redis yok) aynı maçı başka bir istek önce kaydetti: bu kullanıcı da ödedi → açar,
          // iade yok (karar 6). Bizim AI çıktımız atılır.
          saved = winner;
          cached = true;
        }

        if (reservation) {
          try {
            if (!(await settleCredits(reservation.id))) {
              // Eşik sonrası otomatik iade bu isteği beklemeden yapılmış: analiz kullanıcıya ücretsiz kaldı.
              captureError('analysis-settle-after-refund', new Error(`harcama ${reservation.id} zaten iade edilmiş`));
            }
          } catch (e) {
            captureError('analysis-settle', e);
          }
        }

        let unlock: UnlockResult | null = null;
        try {
          unlock = await recordGenerationUnlock(
            viewer.id,
            { id: saved.id, matchId: saved.matchId },
            reservation ? { reservationId: reservation.id } : { privileged: privileged! },
          );
        } catch (e) {
          // Açma kaydı yazılamadı: kullanıcı ödedi; analiz bu cevapta döner, sonraki açmada tekrar anahtarı ikinci düşümü
          // engeller (DuplicateSpendError → "üretiliyor" yerine aşağıdaki not). Sentry'de izlenir.
          captureError('analysis-unlock-record', e);
        }

        if (!cached) {
          try {
            await ensurePredictionRecordForAnalysis(saved);
          } catch (e) {
            captureError('prediction-record', e);
          }
        }

        return fullResponse(saved, cached ? await predictionRecordOf(saved) : null, {
          cached,
          isPostMatch: false,
          unlock,
          credits: reservation ? reservation.balanceAfter : viewer.credits,
        });
      } finally {
        await releaseAnalysisLock(lock);
      }
    })();

    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_CREDITS' });
    }
    if (err instanceof WeeklyFreeUsedError) {
      return res.status(409).json({ error: err.message, code: 'WEEKLY_FREE_USED' });
    }
    if (err instanceof WeeklyFreeNotEligibleError) {
      return res.status(403).json({ error: err.message, code: 'WEEKLY_FREE_NOT_ELIGIBLE', reason: err.reason });
    }
    captureError('analysis-post', err);
    if (err instanceof LlmBudgetExceededError) {
      return res.status(503).json({ error: err.message, code: 'LLM_BUDGET' });
    }
    if (err instanceof AnalysisTimeoutError) {
      return res.status(504).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Analiz üretilemedi. Lütfen tekrar deneyin.' });
  }
}
