/**
 * POST /api/admin/gundem/bot-match-tick — maç öncesi / sonrası taslak poller'ı (15 dk, harici cron: cron-job.org). YALNIZCA
 * `Authorization: Bearer $CRON_SECRET`; sır query string'de reddedilir (bot-tick ile aynı kurallar). Canlı polling yok; yalnızca
 * PENDING taslak yazar (`lib/gundem/bot/matchPostsTick.ts`). Hata durumunda bile 500 dönmez (cron devre dışı bırakmasın).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { runMatchPostsTick } from '@/lib/gundem/bot/matchPostsTick';

const SECRET_LIKE_QUERY = /secret|token|key|auth|password/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (Object.keys(req.query).some((k) => SECRET_LIKE_QUERY.test(k))) {
    return res.status(400).json({ error: 'Sırlar query string ile gönderilemez; Authorization başlığını kullanın.' });
  }
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    return res.status(200).json({ ok: true, summary: await runMatchPostsTick() });
  } catch (e) {
    captureError('gundem:match-tick', e);
    return res.status(200).json({ ok: false, degraded: true });
  }
}
