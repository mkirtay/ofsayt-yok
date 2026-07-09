import { prisma } from '@/lib/prisma';
import type { Role } from '@prisma/client';

export type PhaseStats = {
  phase: 'PRE' | 'HT';
  total: number;
  evaluated: number;
  pending: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
  scoreExactHitCount: number;
  scoreExactHitRate: number;
};

export type AiStatsHistoryItem = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  phase: 'PRE' | 'HT';
  predictedHomePct: number;
  predictedDrawPct: number;
  predictedAwayPct: number;
  predictedScore: string;
  actualResult: string | null;
  actualScore: string | null;
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  evaluatedAt: string | null;
  createdAt: string;
};

export type AiStatsDashboard = {
  totalRecords: number;
  totalEvaluated: number;
  pendingCount: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
  scoreExactHitCount: number;
  scoreExactHitRate: number;
  byPhase: PhaseStats[];
  isAdmin: boolean;
  history: AiStatsHistoryItem[];
};

type RecordRow = {
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  evaluatedAt: Date | null;
  matchId: string;
  predictedHomePct: number;
  predictedDrawPct: number;
  predictedAwayPct: number;
  predictedScore: string;
  actualResult: string | null;
  actualScore: string | null;
  createdAt: Date;
  matchAnalysis: { matchStatus: string; homeTeamName: string; awayTeamName: string };
};

function computePhaseStats(rows: RecordRow[], phase: 'PRE' | 'HT'): PhaseStats {
  const filtered = rows.filter((r) => r.matchAnalysis.matchStatus === phase);
  const evaluatedRows = filtered.filter((r) => r.evaluatedAt != null);
  const evaluated = evaluatedRows.length;
  const result1x2HitCount = evaluatedRows.filter((r) => r.result1x2Hit === true).length;
  const scoreExactHitCount = evaluatedRows.filter((r) => r.scoreExactHit === true).length;

  return {
    phase,
    total: filtered.length,
    evaluated,
    pending: filtered.length - evaluated,
    result1x2HitCount,
    result1x2HitRate:
      evaluated > 0 ? Math.round((result1x2HitCount / evaluated) * 1000) / 10 : 0,
    scoreExactHitCount,
    scoreExactHitRate:
      evaluated > 0 ? Math.round((scoreExactHitCount / evaluated) * 1000) / 10 : 0,
  };
}

export async function loadAiStatsDashboard(auth: {
  role: Role | null;
}): Promise<AiStatsDashboard> {
  const isAdmin = auth.role === 'ADMIN';

  const allRecords = await prisma.predictionRecord.findMany({
    select: {
      result1x2Hit: true,
      scoreExactHit: true,
      evaluatedAt: true,
      matchId: true,
      predictedHomePct: true,
      predictedDrawPct: true,
      predictedAwayPct: true,
      predictedScore: true,
      actualResult: true,
      actualScore: true,
      createdAt: true,
      matchAnalysis: { select: { matchStatus: true, homeTeamName: true, awayTeamName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalRecords = allRecords.length;
  const evaluated = allRecords.filter((r) => r.evaluatedAt != null);
  const totalEvaluated = evaluated.length;
  const pendingCount = totalRecords - totalEvaluated;

  const result1x2HitCount = evaluated.filter((r) => r.result1x2Hit === true).length;
  const scoreExactHitCount = evaluated.filter((r) => r.scoreExactHit === true).length;

  const byPhase: PhaseStats[] = [
    computePhaseStats(allRecords, 'PRE'),
    computePhaseStats(allRecords, 'HT'),
  ].filter((p) => p.total > 0);

  const history: AiStatsHistoryItem[] = allRecords.slice(0, 100).map((r) => ({
    matchId: r.matchId,
    homeTeamName: r.matchAnalysis.homeTeamName,
    awayTeamName: r.matchAnalysis.awayTeamName,
    phase: r.matchAnalysis.matchStatus === 'HT' ? 'HT' : 'PRE',
    predictedHomePct: r.predictedHomePct,
    predictedDrawPct: r.predictedDrawPct,
    predictedAwayPct: r.predictedAwayPct,
    predictedScore: r.predictedScore,
    actualResult: r.actualResult,
    actualScore: r.actualScore,
    result1x2Hit: r.result1x2Hit,
    scoreExactHit: r.scoreExactHit,
    evaluatedAt: r.evaluatedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    totalRecords,
    totalEvaluated,
    pendingCount,
    result1x2HitCount,
    result1x2HitRate:
      totalEvaluated > 0 ? Math.round((result1x2HitCount / totalEvaluated) * 1000) / 10 : 0,
    scoreExactHitCount,
    scoreExactHitRate:
      totalEvaluated > 0 ? Math.round((scoreExactHitCount / totalEvaluated) * 1000) / 10 : 0,
    byPhase,
    isAdmin,
    history,
  };
}
