/**
 * POST /api/admin/evaluate-predictions
 *
 * Biten maçların PredictionRecord'larını actualResult, result1x2Hit vb. ile günceller.
 * Her çağrıda `evaluatedAt IS NULL` olan kayıtları işler. Ayrıca yarım kalmış (10 dk'dan eski PENDING) kredi
 * harcamalarını iade eder (bkz. lib/credits.ts → refundStalePendingSpends).
 *
 * İki şekilde çağrılabilir:
 * - Admin oturumuyla, POST (manuel tetikleme)
 * - `Authorization: Bearer $CRON_SECRET` ile, GET (Vercel Cron — bkz. vercel.json;
 *   Vercel bu header'ı `CRON_SECRET` env değişkeni tanımlıysa otomatik ekler).
 *   Bu olmadan biten maçlar otomatik değerlendirilmez, "Bekliyor" durumunda kalır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import {
  evaluatePendingPredictionRecords,
  type EvaluatePredictionsResult,
} from '@/lib/predictionRecords';
import { refundStalePendingSpends } from '@/lib/credits';
import { captureError } from '@/lib/logger';

function isValidCronRequest(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization;
  return auth === `Bearer ${secret}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<(EvaluatePredictionsResult & { staleCreditRefunds: number | null }) | { error: string }>
) {
  const isCron = isValidCronRequest(req);

  if (req.method !== 'POST' && !(isCron && req.method === 'GET')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isCron) {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
  }

  let staleCreditRefunds: number | null = null;
  try {
    staleCreditRefunds = await refundStalePendingSpends();
  } catch (e) {
    captureError('stale-credit-refunds', e);
  }

  const result = await evaluatePendingPredictionRecords(req);
  return res.status(200).json({ ...result, staleCreditRefunds });
}
