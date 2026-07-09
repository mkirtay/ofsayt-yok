/**
 * GET /api/credits/my-analyses
 * Kullanıcının kredi harcayarak ürettiği (ANALYSIS_SPEND) maç analizlerinin listesi.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/mobileAuth';

export type MyAnalysisItem = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  createdAt: string;
  evaluatedAt: string | null;
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  hitCount: number;
  totalMarketsEvaluated: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getRequestUserId(req, res);
  if (!userId) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  }

  const transactions = await prisma.creditTransaction.findMany({
    where: { userId, type: 'ANALYSIS_SPEND', matchId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { matchId: true, createdAt: true },
  });

  const matchIds = [...new Set(transactions.map((t) => t.matchId as string))];
  if (matchIds.length === 0) {
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json({ items: [] as MyAnalysisItem[] });
  }

  const analyses = await prisma.matchAnalysis.findMany({
    where: { matchId: { in: matchIds }, matchStatus: 'PRE' },
    include: { predictionRecord: true },
  });
  const byMatchId = new Map(analyses.map((a) => [a.matchId, a]));

  const items: MyAnalysisItem[] = transactions
    .map((t) => {
      const analysis = byMatchId.get(t.matchId as string);
      if (!analysis) return null;
      const pr = analysis.predictionRecord;
      const extendedHits = (pr?.extendedHits as Record<string, boolean | null> | null) ?? {};
      const allHits = [pr?.result1x2Hit, pr?.scoreExactHit, ...Object.values(extendedHits)];
      const evaluatedHits = allHits.filter((h) => h !== null && h !== undefined);
      const hitCount = evaluatedHits.filter((h) => h === true).length;
      return {
        matchId: analysis.matchId,
        homeTeamName: analysis.homeTeamName,
        awayTeamName: analysis.awayTeamName,
        createdAt: t.createdAt.toISOString(),
        evaluatedAt: pr?.evaluatedAt?.toISOString() ?? null,
        result1x2Hit: pr?.result1x2Hit ?? null,
        scoreExactHit: pr?.scoreExactHit ?? null,
        hitCount,
        totalMarketsEvaluated: evaluatedHits.length,
      };
    })
    .filter((x): x is MyAnalysisItem => x !== null);

  res.setHeader('Cache-Control', 'private, no-cache');
  return res.status(200).json({ items });
}
