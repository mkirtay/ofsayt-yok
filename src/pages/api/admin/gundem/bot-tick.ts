/**
 * POST /api/admin/gundem/bot-tick — poller (dakikada bir, harici cron). YALNIZCA `Authorization: Bearer $CRON_SECRET`.
 * Sır ASLA query string'de gönderilmez (URL'ler loglanabilir): header dışında hiçbir yerden okunmaz; query'de sır benzeri
 * parametre gelirse istek reddedilir. Yayın yapmaz; yalnızca PENDING taslak yazar (`lib/gundem/bot/tick.ts`).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { runBotTick } from '@/lib/gundem/bot/tick';

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
    const summary = await runBotTick();
    return res.status(200).json({ ok: true, summary });
  } catch (e) {
    captureError('gundem:bot-tick', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
