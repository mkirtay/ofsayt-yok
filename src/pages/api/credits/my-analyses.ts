/**
 * GET /api/credits/my-analyses
 * Kullanıcının ürettiği (kredili ANALYSIS_SPEND ya da kredisiz — yönetici — ANALYSIS_FREE) maç analizlerinin listesi.
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
  /** Nasıl açıldı: CREDIT | WEEKLY_FREE | PREMIUM | ADMIN | LEGACY */
  source: string;
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

  // Kredi modeli v2: kullanıcının açtığı analizler (kredi, haftalık ücretsiz, premium, yönetici, 2026-10 öncesi üretim).
  const unlocks = await prisma.analysisUnlock.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { matchAnalysisId: true, source: true, createdAt: true },
  });
  if (unlocks.length === 0) {
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json({ items: [] as MyAnalysisItem[] });
  }

  const analyses = await prisma.matchAnalysis.findMany({
    where: { id: { in: unlocks.map((u) => u.matchAnalysisId) } },
    include: { predictionRecord: true },
  });
  const byId = new Map(analyses.map((a) => [a.id, a]));

  const items: MyAnalysisItem[] = unlocks
    .map((t) => {
      const analysis = byId.get(t.matchAnalysisId);
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
        source: t.source,
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
