/**
 * Favori takım web bildirimleri (büyüme raporu 3.1) — harici cron dakikada bir (`Authorization: Bearer $CRON_SECRET`).
 * Bayrak kapalı / abone yoksa Sportmonks'a gitmeden döner. Mantık: server/push/tick.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { captureError } from '@/lib/logger';
import { runPushTick } from '@/server/push/tick';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    return res.status(200).json(await runPushTick());
  } catch (e) {
    captureError('cron-push-tick', e);
    return res.status(500).json({ error: 'push tick failed' });
  }
}
