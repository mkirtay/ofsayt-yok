/**
 * /api/matches/[id]/analysis
 *
 * GET  — herkese açık, sadece saklı (PRE) analizi döner (yalnız DB; maç sağlayıcısına istek YOK —
 *        her maç sayfası açılışında çağrılıyor, anonim ve bot trafiği de dahil). Yoksa 404 — mobil uygulama buna
 *        güveniyor; web `?optional=1` gönderir → 200 `{ analysis: null }` (konsolda "Failed to load resource" kalmasın).
 *        Maç fazı istemcide maç verisinden türetilir.
 * POST — giriş yapmış kullanıcı, 5 kredi karşılığında PRE fazında yeni analiz üretir (yönetici — ADMIN — kredisiz; bkz. lib/premium.ts).
 *        Cache'te zaten varsa kredi harcamadan direkt döner. Maç başladıysa (PRE
 *        dışında) üretim reddedilir — sadece saklı PRE analizi döner.
 *
 * Analiz maç-bazlı paylaşılan bir cache'dir: bir kullanıcı ürettikten sonra
 * herkes ücretsiz görüntüleyebilir.
 *
 * Kredi (bkz. lib/credits.ts): düşüm Sportmonks bağlamından SONRA, atomik ve tekrar anahtarlı
 * (`analysis:{matchId}:PRE`) — aynı kullanıcı aynı maç için en fazla bir kez öder (çift tık, iki sekme, tekrar
 * deneme). AI ya da kayıt hatasında aynı istekte iade; yarışı başka üretim kazandıysa iade + o analiz döner.
 * Sportmonks geçici hatası (zaman aşımı, 5xx) → 503, kredi düşülmez.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, type MatchAnalysis } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import {
  DuplicateSpendError,
  InsufficientCreditsError,
  analysisIdempotencyKey,
  isUniqueViolation,
  recordFreeAnalysis,
  refundCredits,
  refundStalePendingSpends,
  reserveCredits,
  settleCredits,
  type CreditReservation,
} from '@/lib/credits';
import { analysisIsFree } from '@/lib/premium';
import { toPublicAnalysis } from '@/utils/analysisScenarios';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { generateMatchAnalysis, AnalysisTimeoutError } from '@/services/aiAnalysisService';
import { captureError } from '@/lib/logger';
import { ensurePredictionRecordForAnalysis } from '@/lib/predictionRecords';
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';

const ANALYSIS_COST_CREDITS = 5;

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

async function handleGet(req: NextApiRequest, res: NextApiResponse, matchId: string) {
  try {
    // Maç verisi olmadan yalnız id ile arama (takım çifti yedeği yok: Sportmonks id'leri kalıcı).
    const existing = await findStoredMatchAnalysis(matchId, 'PRE');
    if (!existing) {
      if (req.query.optional === '1') return res.status(200).json({ analysis: null, predictionRecord: null });
      return res.status(404).json({ error: 'Bu maç için analiz üretilmedi.' });
    }

    const predictionRecord = await prisma.predictionRecord.findUnique({
      where: { matchAnalysisId: existing.id },
    });
    return res.status(200).json({ analysis: toPublicAnalysis(existing), predictionRecord });
  } catch (err) {
    captureError('analysis-get', err);
    return res.status(500).json({ error: 'Analiz getirilemedi.' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, matchId: string) {
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;

  const rl = await hitFixedWindowRateLimit(`analysis:user:${guard.userId}`, 30, 60 * 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Saatlik analiz limitine (30) ulaştınız. Biraz bekleyin.' });
  }

  try {

    const result = await (async () => {
      const tracked = await trackSportmonksFetches(() => buildMatchAnalysisContext(matchId));
      const ctx = tracked.value;
      // Sportmonks geçici hatası (zaman aşımı / 5xx / 429): "maç yok" ya da "arşiv" sanılmasın → 503.
      if (tracked.failed && (!ctx || ctx.archived)) {
        return {
          status: 503 as const,
          body: { error: 'Maç verisi şu an alınamıyor. Lütfen biraz sonra tekrar deneyin.', code: 'UPSTREAM_UNAVAILABLE' },
        };
      }
      if (!ctx) {
        return { status: 404 as const, body: { error: 'Maç bulunamadı' } };
      }

      // Arama ve kayıt aynı id ile (aşağıda `matchId: String(ctx.match.id)`); takım çifti yedeği yok.
      const existing = await findStoredMatchAnalysis(ctx.archived ? matchId : String(ctx.match.id), 'PRE');
      const cachedResponse = async (analysis: MatchAnalysis) => {
        const predictionRecord = await prisma.predictionRecord.findUnique({
          where: { matchAnalysisId: analysis.id },
        });
        return {
          status: 200 as const,
          body: {
            analysis: toPublicAnalysis(analysis),
            predictionRecord,
            cached: true,
            isPostMatch: ctx.archived ? true : ctx.matchPhase !== 'PRE',
            isArchived: ctx.archived,
          },
        };
      };
      if (existing) return cachedResponse(existing);

      if (ctx.archived) {
        return {
          status: 409 as const,
          body: { error: 'Bu maç artık canlı veri sağlayıcısında bulunmuyor; yeni analiz üretilemez.' },
        };
      }

      if (ctx.matchPhase !== 'PRE') {
        return {
          status: 409 as const,
          body: { error: 'Bu maç başladığı için yeni analiz üretilemiyor.' },
        };
      }

      // Yönetici (ve ileride premium) kredi harcamadan üretir (bkz. lib/premium.ts). Kötüye kullanım koruması: rate
      // limit yukarıda. Rol ve güncel `User.credits` DB'den okunur (JWT'deki bayat değer kullanılmaz).
      const owner = await prisma.user.findUnique({ where: { id: guard.userId }, select: { role: true, credits: true } });
      const creditFree = analysisIsFree(owner);
      let reservation: CreditReservation | null = null;
      if (!creditFree) {
        // Bu kullanıcının yarım kalmış eski harcaması varsa önce iade (aynı maçın tekrar anahtarını da serbest bırakır).
        try {
          await refundStalePendingSpends({ userId: guard.userId });
        } catch (e) {
          captureError('analysis-stale-refund', e);
        }
        try {
          reservation = await reserveCredits(guard.userId, ANALYSIS_COST_CREDITS, {
            type: 'ANALYSIS_SPEND',
            matchId,
            idempotencyKey: analysisIdempotencyKey(matchId),
          });
        } catch (e) {
          if (!(e instanceof DuplicateSpendError)) throw e;
          // Aynı kullanıcı aynı maç için zaten ödedi: tamamlandıysa analiz ücretsiz döner, sürüyorsa bekletilir.
          const done = await findStoredMatchAnalysis(String(ctx.match.id), 'PRE');
          if (done) return cachedResponse(done);
          return {
            status: 409 as const,
            body: { error: 'Bu maçın analizi şu an üretiliyor. Birazdan hazır olacak.', code: 'ANALYSIS_IN_PROGRESS' },
          };
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

      let saved;
      try {
        const ai = await generateMatchAnalysis(ctx);
        saved = await prisma.matchAnalysis.create({
          data: {
            matchId: String(ctx.match.id),
            matchStatus: 'PRE',
            homeTeamId: String(ctx.homeTeam.teamId),
            awayTeamId: String(ctx.awayTeam.teamId),
            homeTeamName: ctx.homeTeam.teamName,
            awayTeamName: ctx.awayTeam.teamName,
            competitionId: ctx.match.competition?.id ? String(ctx.match.competition.id) : null,
            competitionName: ctx.match.competition?.name ?? null,
            homeTeamNarrative: ai.analysis.teamAnalyses.home.narrative,
            awayTeamNarrative: ai.analysis.teamAnalyses.away.narrative,
            matchPrediction: ai.analysis.matchPrediction as unknown as Prisma.InputJsonValue,
            scorePrediction: ai.analysis.scorePrediction as unknown as Prisma.InputJsonValue,
            goalExpectation: ai.analysis.goalExpectation as unknown as Prisma.InputJsonValue,
            // Olasılık senaryoları eski `bettingTips` sütununda (migration yok; bkz. utils/analysisScenarios.ts).
            bettingTips: ai.analysis.scenarios as unknown as Prisma.InputJsonValue,
            teamAnalyses: ai.analysis.teamAnalyses as unknown as Prisma.InputJsonValue,
            fullReport: {
              matchSummary: ai.analysis.matchSummary,
              tacticalAnalysis: ai.analysis.tacticalAnalysis,
              heatmapAnalysis: ai.analysis.heatmapAnalysis,
              riskFactors: ai.analysis.riskFactors,
              analystComment: ai.analysis.analystComment,
            } as unknown as Prisma.InputJsonValue,
            riskLevel: ai.analysis.riskLevel,
            riskReasoning: ai.analysis.riskReasoning,
            confidenceScore: ai.analysis.overallConfidence,
            modelVersion: ai.modelVersion,
            tokensUsed: ai.tokensUsed,
            expiresAt: null,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Aynı maçı başka bir istek (başka kullanıcı) aynı anda üretti ve önce kaydetti: iade + o analiz.
          await refund('Aynı maçın analizi eşzamanlı üretildi');
          const winner = await findStoredMatchAnalysis(String(ctx.match.id), 'PRE');
          if (winner) return cachedResponse(winner);
        } else {
          await refund(err instanceof AnalysisTimeoutError ? 'AI analizi zaman aşımı' : 'AI analizi üretilemedi');
        }
        throw err;
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

      // Kredisiz üretim: kredi düşmez ama analiz kaydedildikten sonra 0 tutarlı kayıt yazılır → my-analyses bu analizi de yakalar.
      if (creditFree) {
        try {
          await recordFreeAnalysis(guard.userId, matchId, owner?.credits ?? 0);
        } catch (e) {
          captureError('analysis-free-record', e);
        }
      }

      try {
        await ensurePredictionRecordForAnalysis(saved);
      } catch (e) {
        captureError('prediction-record', e);
      }

      return { status: 200 as const, body: { analysis: toPublicAnalysis(saved), cached: false, isPostMatch: false } };
    })();

    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_CREDITS' });
    }
    captureError('analysis-post', err);
    if (err instanceof AnalysisTimeoutError) {
      return res.status(504).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Analiz üretilemedi. Lütfen tekrar deneyin.' });
  }
}
