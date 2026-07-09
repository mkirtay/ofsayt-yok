/**
 * /api/matches/[id]/analysis
 *
 * GET  — herkese açık, sadece saklı (PRE) analizi döner. Yeni üretim yapmaz.
 * POST — giriş yapmış kullanıcı, 5 kredi karşılığında PRE fazında yeni analiz üretir.
 *        Cache'te zaten varsa kredi harcamadan direkt döner. Maç başladıysa (PRE
 *        dışında) üretim reddedilir — sadece saklı PRE analizi döner.
 *
 * Analiz maç-bazlı paylaşılan bir cache'dir: bir kullanıcı ürettikten sonra
 * herkes ücretsiz görüntüleyebilir.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { spendCredits, InsufficientCreditsError } from '@/lib/credits';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { livescoreAxiosFromIncomingMessage } from '@/server/livescoreInternalAxios';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { generateMatchAnalysis, AnalysisTimeoutError } from '@/services/aiAnalysisService';
import { captureError } from '@/lib/logger';
import { ensurePredictionRecordForAnalysis } from '@/lib/predictionRecords';
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';

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
    const axios = livescoreAxiosFromIncomingMessage(req);
    const result = await runWithLiveScoreHttpClient(axios, async () => {
      const ctx = await buildMatchAnalysisContext(matchId);
      if (!ctx) {
        return { status: 404 as const, body: { error: 'Maç bulunamadı' } };
      }

      const existing = await findStoredMatchAnalysis(matchId, 'PRE', ctx.match);
      if (!existing) {
        return { status: 404 as const, body: { error: 'Bu maç için analiz üretilmedi.' } };
      }

      const predictionRecord = await prisma.predictionRecord.findUnique({
        where: { matchAnalysisId: existing.id },
      });

      return {
        status: 200 as const,
        body: {
          analysis: existing,
          predictionRecord,
          isPostMatch: ctx.matchPhase !== 'PRE',
          matchPhase: ctx.matchPhase,
        },
      };
    });
    return res.status(result.status).json(result.body);
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
    const axios = livescoreAxiosFromIncomingMessage(req);

    const result = await runWithLiveScoreHttpClient(axios, async () => {
      const ctx = await buildMatchAnalysisContext(matchId);
      if (!ctx) {
        return { status: 404 as const, body: { error: 'Maç bulunamadı' } };
      }

      const existing = await findStoredMatchAnalysis(matchId, 'PRE', ctx.match);
      if (existing) {
        const predictionRecord = await prisma.predictionRecord.findUnique({
          where: { matchAnalysisId: existing.id },
        });
        return {
          status: 200 as const,
          body: {
            analysis: existing,
            predictionRecord,
            cached: true,
            isPostMatch: ctx.matchPhase !== 'PRE',
          },
        };
      }

      if (ctx.matchPhase !== 'PRE') {
        return {
          status: 409 as const,
          body: { error: 'Bu maç başladığı için yeni analiz üretilemiyor.' },
        };
      }

      await spendCredits(guard.userId, ANALYSIS_COST_CREDITS, {
        type: 'ANALYSIS_SPEND',
        matchId,
      });

      const ai = await generateMatchAnalysis(ctx);

      const saved = await prisma.matchAnalysis.create({
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
          bettingTips: ai.analysis.bettingTips as unknown as Prisma.InputJsonValue,
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

      try {
        await ensurePredictionRecordForAnalysis(saved);
      } catch (e) {
        captureError('prediction-record', e);
      }

      return { status: 200 as const, body: { analysis: saved, cached: false, isPostMatch: false } };
    });

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
