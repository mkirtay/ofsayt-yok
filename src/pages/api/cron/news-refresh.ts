/**
 * GET/POST /api/cron/news-refresh — AI haber hattını bir kez çalıştırır (server/news/aiNews.ts). YALNIZ
 * `Authorization: Bearer $CRON_SECRET`. Öneri: cron-job.org her 15 dk. Kilit + günlük tavan aiNews'te.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { captureError } from '@/lib/logger';
import { refreshNews } from '@/server/news/aiNews';

export const config = { maxDuration: 120 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    return res.status(200).json({ ok: true, summary: await refreshNews() });
  } catch (e) {
    captureError('news-refresh', e);
    return res.status(500).json({ error: 'Haberler yenilenemedi.' });
  }
}
