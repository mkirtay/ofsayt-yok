/**
 * Üretilen AI analizinin `MatchAnalysis` kaydı — kullanıcı isteği (`POST /api/matches/[id]/analysis`) ve maç öncesi
 * cron üretimi aynı eşlemeyi kullanır. Aynı maç için ikinci kayıt `@@unique([matchId, matchStatus])` ile reddedilir
 * (Prisma P2002); çağıran taraf bunu yakalar.
 */
import { Prisma, type MatchAnalysis } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import type { AiAnalysisResult } from '@/services/aiAnalysisService';

export async function saveGeneratedAnalysis(ctx: MatchAnalysisContext, ai: AiAnalysisResult): Promise<MatchAnalysis> {
  return prisma.matchAnalysis.create({
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
}
