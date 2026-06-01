/**
 * POST /api/admin/evaluate-predictions
 *
 * Biten maçların PredictionRecord'larını actualResult, result1x2Hit vb. ile günceller.
 * Admin-only. Her çağrıda `evaluatedAt IS NULL` olan kayıtları işler.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requirePremium';
import {
  evaluatePendingPredictionRecords,
  type EvaluatePredictionsResult,
} from '@/lib/predictionRecords';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EvaluatePredictionsResult | { error: string }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;

  const result = await evaluatePendingPredictionRecords(req);
  return res.status(200).json(result);
}
