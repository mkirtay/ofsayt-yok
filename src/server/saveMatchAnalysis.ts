/**
 * Üretilen AI analizinin `MatchAnalysis` kaydı — kullanıcı isteği (`POST /api/matches/[id]/analysis`) ve maç öncesi
 * cron üretimi aynı eşlemeyi kullanır. Aynı maç için ikinci kayıt `@@unique([matchId, matchStatus])` ile reddedilir
 * (Prisma P2002); çağıran taraf bunu yakalar.
 */
import { Prisma, type MatchAnalysis } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import type { AiAnalysisResult } from '@/services/aiAnalysisService';
import calibrationMapJson from '@/config/aiCalibrationMap.json';
import { calibrateProbabilities, calibrateScenarios, pickByLift, type CalibrationMap } from '@/utils/probabilityCalibration';

const calibrationMap = calibrationMapJson as CalibrationMap;

/** `AI_CALIBRATION_ENABLED=false` ile kapatılır (varsayılan açık; büyüme raporu 1.4/1.5). */
export function calibrationEnabled(): boolean {
  return process.env.AI_CALIBRATION_ENABLED !== 'false';
}

type Analysis = AiAnalysisResult['analysis'];

/**
 * Kayıt öncesi: olasılıklar kalibre edilir (ham hali `rawProbabilities`), öne çıkan 3 tahmin "temel orandan sapan"
 * kuralıyla seçilip kayda yazılır (`topPickKeys`). Kapalıysa analiz aynen, ek alan yok.
 */
export function prepareProbabilities(a: Analysis): { analysis: Analysis; extra: Record<string, unknown> } {
  if (!calibrationEnabled()) return { analysis: a, extra: {} };
  const probs = calibrateProbabilities(
    { matchPrediction: a.matchPrediction as unknown as Record<string, unknown>, goalExpectation: a.goalExpectation as unknown as Record<string, unknown> },
    calibrationMap,
  );
  const analysis = {
    ...a,
    matchPrediction: probs.matchPrediction as unknown as Analysis['matchPrediction'],
    goalExpectation: probs.goalExpectation as unknown as Analysis['goalExpectation'],
    scenarios: calibrateScenarios(a.scenarios ?? [], calibrationMap) as Analysis['scenarios'],
  };
  return {
    analysis,
    extra: {
      rawProbabilities: { matchPrediction: a.matchPrediction, goalExpectation: a.goalExpectation, scenarios: a.scenarios },
      calibrationVersion: calibrationMap.version,
      topPickKeys: pickByLift(probs, calibrationMap.baseRates),
    },
  };
}

export async function saveGeneratedAnalysis(ctx: MatchAnalysisContext, generated: AiAnalysisResult): Promise<MatchAnalysis> {
  const { analysis, extra } = prepareProbabilities(generated.analysis);
  const ai = { ...generated, analysis };
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
        ...extra,
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
