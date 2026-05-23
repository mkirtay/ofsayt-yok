/**
 * GET /api/matches/[id]/analysis
 *
 * Premium kullanıcılar için Claude tabanlı maç analizi üretir.
 * Cache: (matchId, matchStatus) bazlı. PRE fazında 30 dk TTL,
 * HT/POST için süresiz (faz değiştiğinde yeni satır oluşur).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePremium } from '@/lib/requirePremium';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { livescoreAxiosFromIncomingMessage } from '@/server/livescoreInternalAxios';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { generateMatchAnalysis, AnalysisTimeoutError } from '@/services/aiAnalysisService';
import { captureError } from '@/lib/logger';

const PRE_TTL_MS = 30 * 60 * 1000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await requirePremium(req, res);
  if (!guard.ok) return;

  // Kullanıcı başına saatlik AI analiz limiti — her çağrı OpenAI'ya ücretli istek atar
  const rl = await hitFixedWindowRateLimit(`analysis:user:${guard.userId}`, 30, 60 * 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Saatlik analiz limitine (30) ulaştınız. Biraz bekleyin.' });
  }

  const { id } = req.query;
  const matchId = Array.isArray(id) ? id[0] : id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId zorunlu' });
  }

  try {
    const axios = livescoreAxiosFromIncomingMessage(req);

    const result = await runWithLiveScoreHttpClient(axios, async () => {
      const ctx = await buildMatchAnalysisContext(matchId);
      if (!ctx) {
        return { status: 404 as const, body: { error: 'Maç bulunamadı' } };
      }

      // POST fazda yeni analiz üretme — PRE analizini döndür
      if (ctx.matchPhase === 'POST') {
        const preAnalysis = await prisma.matchAnalysis.findUnique({
          where: { matchId_matchStatus: { matchId, matchStatus: 'PRE' } },
        });
        if (preAnalysis) {
          return { status: 200 as const, body: { analysis: preAnalysis, cached: true, isPostMatch: true } };
        }
        return { status: 404 as const, body: { error: 'Bu maç için ön analiz mevcut değil.' } };
      }

      // Cache kontrolü
      const existing = await prisma.matchAnalysis.findUnique({
        where: {
          matchId_matchStatus: {
            matchId,
            matchStatus: ctx.matchPhase,
          },
        },
      });
      const now = new Date();
      if (existing) {
        const stillValid =
          existing.expiresAt == null || existing.expiresAt > now;
        if (stillValid) {
          return {
            status: 200 as const,
            body: { analysis: existing, cached: true },
          };
        }
      }

      // Yeni analiz üret
      const ai = await generateMatchAnalysis(ctx);
      const expiresAt =
        ctx.matchPhase === 'PRE' ? new Date(now.getTime() + PRE_TTL_MS) : null;

      const saved = existing
        ? await prisma.matchAnalysis.update({
            where: { id: existing.id },
            data: {
              homeTeamNarrative: ai.analysis.teamAnalyses.home.narrative,
              awayTeamNarrative: ai.analysis.teamAnalyses.away.narrative,
              matchPrediction: ai.analysis.matchPrediction as unknown as Prisma.InputJsonValue,
              scorePrediction: ai.analysis.scorePrediction as unknown as Prisma.InputJsonValue,
              goalExpectation: ai.analysis.goalExpectation as unknown as Prisma.InputJsonValue,
              bettingTips: ai.analysis.bettingTips as unknown as Prisma.InputJsonValue,
              teamAnalyses: ai.analysis.teamAnalyses as unknown as Prisma.InputJsonValue,
              riskLevel: ai.analysis.riskLevel,
              riskReasoning: ai.analysis.riskReasoning,
              confidenceScore: ai.analysis.overallConfidence,
              modelVersion: ai.modelVersion,
              tokensUsed: ai.tokensUsed,
              expiresAt,
              updatedAt: now,
            },
          })
        : await prisma.matchAnalysis.create({
            data: {
              matchId,
              matchStatus: ctx.matchPhase,
              homeTeamId: String(ctx.homeTeam.teamId),
              awayTeamId: String(ctx.awayTeam.teamId),
              homeTeamName: ctx.homeTeam.teamName,
              awayTeamName: ctx.awayTeam.teamName,
              competitionId: ctx.match.competition?.id
                ? String(ctx.match.competition.id)
                : null,
              competitionName: ctx.match.competition?.name ?? null,
              homeTeamNarrative: ai.analysis.teamAnalyses.home.narrative,
              awayTeamNarrative: ai.analysis.teamAnalyses.away.narrative,
              matchPrediction: ai.analysis.matchPrediction as unknown as Prisma.InputJsonValue,
              scorePrediction: ai.analysis.scorePrediction as unknown as Prisma.InputJsonValue,
              goalExpectation: ai.analysis.goalExpectation as unknown as Prisma.InputJsonValue,
              bettingTips: ai.analysis.bettingTips as unknown as Prisma.InputJsonValue,
              teamAnalyses: ai.analysis.teamAnalyses as unknown as Prisma.InputJsonValue,
              riskLevel: ai.analysis.riskLevel,
              riskReasoning: ai.analysis.riskReasoning,
              confidenceScore: ai.analysis.overallConfidence,
              modelVersion: ai.modelVersion,
              tokensUsed: ai.tokensUsed,
              expiresAt,
            },
          });

      // PRE fazda ilk kez oluşturulduğunda tahmin kaydı oluştur
      if (ctx.matchPhase === 'PRE' && !existing) {
        try {
          await prisma.predictionRecord.create({
            data: {
              matchAnalysisId: saved.id,
              matchId,
              matchLabel: `${ctx.homeTeam.teamName} - ${ctx.awayTeam.teamName}`,
              predictedHomePct: ai.analysis.matchPrediction.home,
              predictedDrawPct: ai.analysis.matchPrediction.draw,
              predictedAwayPct: ai.analysis.matchPrediction.away,
              predictedScore: ai.analysis.scorePrediction.mostLikely,
              predictedOver25: ai.analysis.goalExpectation.over25,
              predictedBtts: ai.analysis.goalExpectation.btts,
              modelVersion: ai.modelVersion,
            },
          });
        } catch (e) {
          captureError('prediction-record', e);
        }
      }

      return {
        status: 200 as const,
        body: { analysis: saved, cached: false },
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    captureError('analysis', err);
    if (err instanceof AnalysisTimeoutError) {
      return res.status(504).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Analiz üretilemedi. Lütfen tekrar deneyin.' });
  }
}
