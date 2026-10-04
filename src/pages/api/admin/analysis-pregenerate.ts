/**
 * POST /api/admin/analysis-pregenerate — popüler maçların AI analizini maçtan ~3 saat önce üretir
 * (bkz. server/analysisPregen.ts).
 *
 * - `Authorization: Bearer $CRON_SECRET` (cron-job.org 15 dk / GitHub Actions yedek): kilit alınınca HEMEN 202,
 *   iş arka planda sürer (ücretsiz cron-job.org 30 sn'de kesiyor). Aynı anda ikinci çağrı 409 ALREADY_RUNNING.
 * - Yönetici oturumuyla elle: SENKRON, sonuç yanıtta.
 * - `?dryRun=1`: yalnız adayları listeler (LLM yok, kilit/nabız yok), her zaman senkron.
 * Her gerçek çalışma nabız yazar (bkz. server/cronJobs.ts).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { runAnalysisPregen, summarizePregen, type PregenResult } from '@/server/analysisPregen';
import { captureError } from '@/lib/logger';
import { acquireCronLock, isCronRequest, runCronJob } from '@/server/cronJobs';
import { runInBackground } from '@/server/backgroundTask';

export const config = { maxDuration: 120 };

type Body = PregenResult | { accepted: true; job: string } | { error: string; code?: string };

const BUSY = { error: 'Ön üretim zaten çalışıyor.', code: 'ALREADY_RUNNING' } as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const isCron = isCronRequest(req.headers.authorization);
  if (!isCron) {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
  }

  if (req.query.dryRun === '1') {
    try {
      return res.status(200).json(await runAnalysisPregen({ dryRun: true }));
    } catch (e) {
      captureError('analysis-pregen-run', e);
      return res.status(500).json({ error: 'Ön üretim çalıştırılamadı.' });
    }
  }

  if (isCron) {
    const lock = await acquireCronLock('analysis-pregenerate');
    if (!lock) return res.status(409).json(BUSY);
    runInBackground(() => runCronJob('analysis-pregenerate', 'cron', () => runAnalysisPregen(), summarizePregen, lock));
    return res.status(202).json({ accepted: true, job: 'analysis-pregenerate' });
  }

  const run = await runCronJob('analysis-pregenerate', 'admin', () => runAnalysisPregen(), summarizePregen);
  if (run.status === 'busy') return res.status(409).json(BUSY);
  if (run.status === 'failed') return res.status(500).json({ error: 'Ön üretim çalıştırılamadı.' });
  return res.status(200).json(run.result);
}
