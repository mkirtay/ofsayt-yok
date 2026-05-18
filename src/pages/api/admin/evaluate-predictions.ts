/**
 * POST /api/admin/evaluate-predictions
 *
 * Biten maçların PredictionRecord'larını actualResult, result1x2Hit vb. ile günceller.
 * Admin-only. Her çağrıda `evaluatedAt IS NULL` olan kayıtları işler.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requirePremium';
import { prisma } from '@/lib/prisma';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { livescoreAxiosFromIncomingMessage } from '@/server/livescoreInternalAxios';
import { getMatchWithEvents } from '@/services/liveScoreService';

type EvalResult = {
  evaluated: number;
  skipped: number;
  errors: number;
  details: { matchId: string; status: 'ok' | 'not_finished' | 'error'; result1x2Hit?: boolean }[];
};

function parseScoreGoals(raw?: string | null): [number, number] | null {
  if (!raw) return null;
  const m = /(\d+)\s*[-:]\s*(\d+)/.exec(String(raw));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EvalResult | { error: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;

  const pending = await prisma.predictionRecord.findMany({
    where: { evaluatedAt: null },
    select: {
      id: true,
      matchId: true,
      predictedHomePct: true,
      predictedDrawPct: true,
      predictedAwayPct: true,
      predictedScore: true,
    },
  });

  const result: EvalResult = { evaluated: 0, skipped: 0, errors: 0, details: [] };

  if (pending.length === 0) {
    return res.status(200).json(result);
  }

  const axios = livescoreAxiosFromIncomingMessage(req);

  for (const record of pending) {
    try {
      const { match } = await runWithLiveScoreHttpClient(axios, () =>
        getMatchWithEvents(record.matchId)
      );

      if (!match || match.status !== 'FINISHED') {
        result.skipped += 1;
        result.details.push({ matchId: record.matchId, status: 'not_finished' });
        continue;
      }

      const scoreRaw =
        match.scores?.ft_score ||
        match.scores?.score ||
        match.score;

      const goals = parseScoreGoals(scoreRaw);
      if (!goals) {
        result.skipped += 1;
        result.details.push({ matchId: record.matchId, status: 'not_finished' });
        continue;
      }

      const [homeGoals, awayGoals] = goals;
      const actualResult =
        homeGoals > awayGoals ? 'HOME' : homeGoals < awayGoals ? 'AWAY' : 'DRAW';
      const actualScore = `${homeGoals}-${awayGoals}`;
      const actualOver25 = homeGoals + awayGoals > 2;
      const actualBtts = homeGoals > 0 && awayGoals > 0;

      // En yüksek olasılık → tahmin edilen sonuç
      const maxPct = Math.max(
        record.predictedHomePct,
        record.predictedDrawPct,
        record.predictedAwayPct
      );
      const predictedResult =
        record.predictedHomePct === maxPct
          ? 'HOME'
          : record.predictedDrawPct === maxPct
          ? 'DRAW'
          : 'AWAY';

      const result1x2Hit = predictedResult === actualResult;
      const scoreExactHit =
        record.predictedScore.replace(/\s/g, '') === actualScore;

      await prisma.predictionRecord.update({
        where: { id: record.id },
        data: {
          actualResult,
          actualScore,
          actualOver25,
          actualBtts,
          result1x2Hit,
          scoreExactHit,
          evaluatedAt: new Date(),
        },
      });

      result.evaluated += 1;
      result.details.push({ matchId: record.matchId, status: 'ok', result1x2Hit });
    } catch (e) {
      console.error('evaluate-predictions error for matchId', record.matchId, e);
      result.errors += 1;
      result.details.push({ matchId: record.matchId, status: 'error' });
    }
  }

  return res.status(200).json(result);
}
