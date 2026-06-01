import type { MatchAnalysis, Prisma } from '@prisma/client';
import type { Match } from '@/models/liveScore';
import { prisma } from '@/lib/prisma';

function teamPairWhere(
  homeTeamId: string | number,
  awayTeamId: string | number
): Prisma.MatchAnalysisWhereInput {
  const h = String(homeTeamId);
  const a = String(awayTeamId);
  return {
    OR: [
      { homeTeamId: h, awayTeamId: a },
      { homeTeamId: a, awayTeamId: h },
    ],
  };
}

/** URL/API matchId veya takım çifti ile kayıtlı analizi bulur (eski matchId için). */
export async function findStoredMatchAnalysis(
  matchId: string,
  matchStatus: string,
  match?: Match | null
): Promise<MatchAnalysis | null> {
  const direct = await prisma.matchAnalysis.findUnique({
    where: { matchId_matchStatus: { matchId, matchStatus } },
  });
  if (direct) return direct;

  const homeId = match?.home?.id ?? match?.home_id;
  const awayId = match?.away?.id ?? match?.away_id;
  if (homeId == null || awayId == null) return null;

  return prisma.matchAnalysis.findFirst({
    where: {
      matchStatus,
      ...teamPairWhere(homeId, awayId),
    },
    orderBy: { createdAt: 'desc' },
  });
}
