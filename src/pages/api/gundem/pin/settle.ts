/**
 * Haftalık 1. sıra kapanışı (Pazartesi 01:00 İstanbul = Pazar 22:00 UTC; vercel.json cron). Biten haftanın liderini
 * COMPLETED işaretler — teklifin tamamı kullanılmış sayılır, iade yok. Doğruluk buna bağlı değil (lib/pinBid.ts tembel
 * sıfırlama); bu yalnız kayıtları zamanında kapatır. Vercel Cron GET, elle tetikleme POST; ikisi de `Bearer CRON_SECRET`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { settleFinishedWeeks } from '@/lib/pinBid';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    return res.status(200).json({ completed: await settleFinishedWeeks() });
  } catch (e) {
    captureError('gundem:pin-settle', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
