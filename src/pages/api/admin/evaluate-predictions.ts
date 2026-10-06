/**
 * POST /api/admin/evaluate-predictions
 *
 * Biten maçların PredictionRecord'larını actualResult, result1x2Hit vb. ile günceller.
 * Her çağrıda `evaluatedAt IS NULL` olan kayıtları işler. Ayrıca yarım kalmış (10 dk'dan eski PENDING) kredi
 * harcamalarını iade eder (bkz. lib/credits.ts → refundStalePendingSpends).
 *
 * İki şekilde çağrılabilir:
 * - Admin oturumuyla, POST (elle: /ai-istatistikleri "Sonuçlarla Karşılaştır") → SENKRON, sonuç yanıtta.
 * - `Authorization: Bearer $CRON_SECRET` ile POST (cron-job.org / GitHub Actions) ya da GET (Vercel Cron) →
 *   kilit alınınca HEMEN 202, iş arka planda sürer (ücretsiz cron-job.org 30 sn'de kesiyor).
 * Aynı anda ikinci çağrı 409 ALREADY_RUNNING (bkz. server/cronJobs.ts). Her çalışma nabız yazar.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import {
  evaluatePendingPredictionRecords,
  type EvaluatePredictionsResult,
} from '@/lib/predictionRecords';
import { refundStalePendingSpends } from '@/lib/credits';
import { captureError } from '@/lib/logger';
import { acquireCronLock, isCronRequest, recordCronTick, runCronJob } from '@/server/cronJobs';
import { runInBackground } from '@/server/backgroundTask';

export const config = { maxDuration: 300 };

type EvaluateRunResult = EvaluatePredictionsResult & { staleCreditRefunds: number | null };
type Body = EvaluateRunResult | { accepted: true; job: string } | { error: string; code?: string };

async function evaluateOnce(req: NextApiRequest): Promise<EvaluateRunResult> {
  let staleCreditRefunds: number | null = null;
  try {
    staleCreditRefunds = await refundStalePendingSpends();
  } catch (e) {
    captureError('stale-credit-refunds', e);
  }
  const result = await evaluatePendingPredictionRecords(req);
  return { ...result, staleCreditRefunds };
}

const summarize = (r: EvaluateRunResult) => ({
  evaluated: r.evaluated,
  skipped: r.skipped,
  unresolved: r.unresolved,
  errors: r.errors,
  staleCreditRefunds: r.staleCreditRefunds ?? 0,
});

const BUSY = { error: 'Değerlendirme zaten çalışıyor.', code: 'ALREADY_RUNNING' } as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  const isCron = isCronRequest(req.headers.authorization);

  if (req.method !== 'POST' && !(isCron && req.method === 'GET')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isCron) {
    const lock = await acquireCronLock('evaluate-predictions');
    if (!lock) return res.status(409).json(BUSY);
    // Tick nabzı yanıttan önce (arka plan dondurulsa da "son çalışma" güncel); iş yanıttan sonra sürer.
    const ticked = await recordCronTick('evaluate-predictions', 'cron');
    runInBackground(() => runCronJob('evaluate-predictions', 'cron', () => evaluateOnce(req), summarize, { lock, ticked }));
    return res.status(202).json({ accepted: true, job: 'evaluate-predictions' });
  }

  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;

  const run = await runCronJob('evaluate-predictions', 'admin', () => evaluateOnce(req), summarize);
  if (run.status === 'busy') return res.status(409).json(BUSY);
  if (run.status === 'failed') return res.status(500).json({ error: 'Değerlendirme başarısız oldu.' });
  return res.status(200).json(run.result);
}
