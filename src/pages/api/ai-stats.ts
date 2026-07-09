import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { getRequestAuth } from '@/lib/mobileAuth';

export type AiStatsByVersion = {
  version: string;
  total: number;
  hitCount: number;
  hitRate: number;
};

export type AiStatsHistoryItem = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  predictedHomePct: number;
  predictedDrawPct: number;
  predictedAwayPct: number;
  predictedScore: string;
  actualResult: string | null;
  actualScore: string | null;
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  createdAt: string;
};

export type AiStatsResponse = {
  totalEvaluated: number;
  result1x2HitCount: number;
  result1x2HitRate: number;
  scoreExactHitCount: number;
  scoreExactHitRate: number;
  byModelVersion: AiStatsByVersion[];
  history?: AiStatsHistoryItem[];
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AiStatsResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(req.headers, req.socket.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`aistats:${ip}`, 30, 60 * 1000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Aggregate stats — public
  const evaluated = await prisma.predictionRecord.findMany({
    where: { evaluatedAt: { not: null } },
    select: {
      result1x2Hit: true,
      scoreExactHit: true,
      modelVersion: true,
    },
  });

  const totalEvaluated = evaluated.length;
  const result1x2HitCount = evaluated.filter((r) => r.result1x2Hit === true).length;
  const scoreExactHitCount = evaluated.filter((r) => r.scoreExactHit === true).length;

  const versionMap = new Map<string, { total: number; hitCount: number }>();
  for (const r of evaluated) {
    const v = r.modelVersion;
    const entry = versionMap.get(v) ?? { total: 0, hitCount: 0 };
    entry.total += 1;
    if (r.result1x2Hit === true) entry.hitCount += 1;
    versionMap.set(v, entry);
  }

  const byModelVersion: AiStatsByVersion[] = Array.from(versionMap.entries()).map(
    ([version, { total, hitCount }]) => ({
      version,
      total,
      hitCount,
      hitRate: total > 0 ? Math.round((hitCount / total) * 1000) / 10 : 0,
    })
  );

  const response: AiStatsResponse = {
    totalEvaluated,
    result1x2HitCount,
    result1x2HitRate:
      totalEvaluated > 0 ? Math.round((result1x2HitCount / totalEvaluated) * 1000) / 10 : 0,
    scoreExactHitCount,
    scoreExactHitRate:
      totalEvaluated > 0 ? Math.round((scoreExactHitCount / totalEvaluated) * 1000) / 10 : 0,
    byModelVersion,
  };

  // Giriş yapmış herkese açık geçmiş (cookie veya Bearer)
  const auth = await getRequestAuth(req, res);
  const isAuthenticated = auth != null;

  if (req.query.history === '1' && isAuthenticated) {
    const history = await prisma.predictionRecord.findMany({
      where: { evaluatedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        matchId: true,
        predictedHomePct: true,
        predictedDrawPct: true,
        predictedAwayPct: true,
        predictedScore: true,
        actualResult: true,
        actualScore: true,
        result1x2Hit: true,
        scoreExactHit: true,
        createdAt: true,
        matchAnalysis: {
          select: { homeTeamName: true, awayTeamName: true },
        },
      },
    });

    response.history = history.map((r) => ({
      matchId: r.matchId,
      homeTeamName: r.matchAnalysis.homeTeamName,
      awayTeamName: r.matchAnalysis.awayTeamName,
      predictedHomePct: r.predictedHomePct,
      predictedDrawPct: r.predictedDrawPct,
      predictedAwayPct: r.predictedAwayPct,
      predictedScore: r.predictedScore,
      actualResult: r.actualResult,
      actualScore: r.actualScore,
      result1x2Hit: r.result1x2Hit,
      scoreExactHit: r.scoreExactHit,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // Cache: 5 min public, private for history
  const isHistoryReq = req.query.history === '1' && isAuthenticated;
  res.setHeader(
    'Cache-Control',
    isHistoryReq ? 'private, no-cache' : 'public, s-maxage=300, stale-while-revalidate=600'
  );

  return res.status(200).json(response);
}
