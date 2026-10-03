import { prisma } from '@/lib/prisma';
import type { Role } from '@prisma/client';
import { UNRESOLVED_ACTUAL_RESULT } from '@/lib/predictionRecords';

export type PhaseStats = {
  phase: 'PRE' | 'HT';
  total: number;
  evaluated: number;
  pending: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
};

/**
 * Herkese açık geçmiş satırı. Skor öngörüsü (tahmini skor, gerçek skor, tam skor isabeti) 2026-10-03'ten beri
 * yanıtta YOK — sayfa yalnız maç sonucu olasılığını gösterir (ana analizin dil kurallarıyla uyumlu); kayıtlı veri
 * DB'de durur.
 */
export type AiStatsHistoryItem = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  phase: 'PRE' | 'HT';
  predictedHomePct: number;
  predictedDrawPct: number;
  predictedAwayPct: number;
  actualResult: string | null;
  result1x2Hit: boolean | null;
  evaluatedAt: string | null;
  createdAt: string;
};

export type AiStatsDashboard = {
  totalRecords: number;
  totalEvaluated: number;
  pendingCount: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
  byPhase: PhaseStats[];
  isAdmin: boolean;
  history: AiStatsHistoryItem[];
};

type RecordRow = {
  result1x2Hit: boolean | null;
  evaluatedAt: Date | null;
  matchId: string;
  predictedHomePct: number;
  predictedDrawPct: number;
  predictedAwayPct: number;
  actualResult: string | null;
  createdAt: Date;
  matchAnalysis: { matchStatus: string; homeTeamName: string; awayTeamName: string };
};

function computePhaseStats(rows: RecordRow[], phase: 'PRE' | 'HT'): PhaseStats {
  const filtered = rows.filter((r) => r.matchAnalysis.matchStatus === phase);
  const evaluatedRows = filtered.filter((r) => r.evaluatedAt != null);
  const evaluated = evaluatedRows.length;
  const result1x2HitCount = evaluatedRows.filter((r) => r.result1x2Hit === true).length;

  return {
    phase,
    total: filtered.length,
    evaluated,
    pending: filtered.filter((r) => r.evaluatedAt == null && r.actualResult !== UNRESOLVED_ACTUAL_RESULT).length,
    result1x2HitCount,
    result1x2HitRate:
      evaluated > 0 ? Math.round((result1x2HitCount / evaluated) * 1000) / 10 : 0,
  };
}

export async function loadAiStatsDashboard(auth: {
  role: Role | null;
}): Promise<AiStatsDashboard> {
  const isAdmin = auth.role === 'ADMIN';

  const allRecords = await prisma.predictionRecord.findMany({
    select: {
      result1x2Hit: true,
      evaluatedAt: true,
      matchId: true,
      predictedHomePct: true,
      predictedDrawPct: true,
      predictedAwayPct: true,
      actualResult: true,
      createdAt: true,
      matchAnalysis: { select: { matchStatus: true, homeTeamName: true, awayTeamName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalRecords = allRecords.length;
  const evaluated = allRecords.filter((r) => r.evaluatedAt != null);
  const totalEvaluated = evaluated.length;
  // "Çözülemedi" diye kapatılanlar (evaluatedAt boş) bekleyen sayılmaz — bkz. predictionRecords.ts.
  const pendingCount = allRecords.filter(
    (r) => r.evaluatedAt == null && r.actualResult !== UNRESOLVED_ACTUAL_RESULT,
  ).length;

  const result1x2HitCount = evaluated.filter((r) => r.result1x2Hit === true).length;

  const byPhase: PhaseStats[] = [
    computePhaseStats(allRecords, 'PRE'),
    computePhaseStats(allRecords, 'HT'),
  ].filter((p) => p.total > 0);

  // Kredi modeli v2: oynanmamış maçın tahmini (olasılıklar) kilitli analiz içeriği → herkese açık geçmişte
  // yalnız değerlendirilmiş (bitmiş) maçlar; bekleyenler yalnız sayı olarak (pendingCount). Yönetici hepsini görür.
  const historySource = isAdmin ? allRecords : evaluated;
  const history: AiStatsHistoryItem[] = historySource.slice(0, 100).map((r) => ({
    matchId: r.matchId,
    homeTeamName: r.matchAnalysis.homeTeamName,
    awayTeamName: r.matchAnalysis.awayTeamName,
    phase: r.matchAnalysis.matchStatus === 'HT' ? 'HT' : 'PRE',
    predictedHomePct: r.predictedHomePct,
    predictedDrawPct: r.predictedDrawPct,
    predictedAwayPct: r.predictedAwayPct,
    actualResult: r.actualResult,
    result1x2Hit: r.result1x2Hit,
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
    byPhase,
    isAdmin,
    history,
  };
}
