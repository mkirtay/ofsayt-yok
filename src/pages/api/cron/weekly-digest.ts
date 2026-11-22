/** Haftalık e-posta özeti (büyüme raporu 3.3) — harici cron, Pazartesi sabahı (`Authorization: Bearer $CRON_SECRET`). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { captureError } from '@/lib/logger';
import { runWeeklyDigest } from '@/lib/weeklyDigest';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    return res.status(200).json(await runWeeklyDigest());
  } catch (e) {
    captureError('cron-weekly-digest', e);
    return res.status(500).json({ error: 'digest failed' });
  }
}
