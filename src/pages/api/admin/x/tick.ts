/**
 * POST /api/admin/x/tick — X botu poller (dakikada bir, harici cron). YALNIZCA `Authorization: Bearer $CRON_SECRET`.
 * Sır query string'de gönderilemez (gündem bot-tick ile aynı kural). Mod `X_BOT_MODE` (off | dry | live): bkz. lib/xbot/tick.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { runXTick } from '@/lib/xbot/tick';

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
    return res.status(200).json({ ok: true, summary: await runXTick() });
  } catch (e) {
    captureError('xbot:tick', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
