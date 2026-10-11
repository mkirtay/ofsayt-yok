/**
 * POST /api/admin/game/settle — tahmin oyunu sonuç işi (server/game/settle.ts).
 * - Admin oturumuyla POST → SENKRON, özet yanıtta.
 * - `Authorization: Bearer $CRON_SECRET` ile POST (cron-job.org, 10 dk) ya da GET (Vercel günlük yedek) → kilit alınınca
 *   HEMEN 202, iş arka planda (evaluate-predictions ile aynı kalıp). Aynı anda ikinci çağrı 409 ALREADY_RUNNING.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { acquireCronLock, isCronRequest, recordCronTick, runCronJob } from '@/server/cronJobs';
import { runInBackground } from '@/server/backgroundTask';
import { settleGameMatches, type SettleSummary } from '@/server/game/settle';
import { withGameGate } from '@/server/game/access';

export const config = { maxDuration: 120 };

const BUSY = { error: 'Sonuç işi zaten çalışıyor.', code: 'ALREADY_RUNNING' } as const;
const summarize = (r: SettleSummary) => ({ ...r });

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const isCron = isCronRequest(req.headers.authorization);
  if (req.method !== 'POST' && !(isCron && req.method === 'GET')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (isCron) {
    const lock = await acquireCronLock('game-settle');
    if (!lock) return res.status(409).json(BUSY);
    const ticked = await recordCronTick('game-settle', 'cron');
    runInBackground(() => runCronJob('game-settle', 'cron', () => settleGameMatches(), summarize, { lock, ticked }));
    return res.status(202).json({ accepted: true, job: 'game-settle' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const run = await runCronJob('game-settle', 'admin', () => settleGameMatches(), summarize);
  if (run.status === 'busy') return res.status(409).json(BUSY);
  if (run.status === 'failed') return res.status(500).json({ error: 'Sonuç işi başarısız oldu.' });
  return res.status(200).json(run.result);
}

export default withGameGate(handler, { cronBypass: (req) => isCronRequest(req.headers.authorization) });
