/**
 * GET /api/referees/{id}/report — hakem sayfası "AI hakem raporu" (bkz. server/people/refereeReport.ts).
 * Yalnız sayfa verisi Redis'te olan hakem için; rapor hakem başına önbellekli. İlk üretim ~10-20 sn sürebilir
 * (aynı anda ikinci istek `pending` alır, istemci birkaç saniye sonra yeniden sorar). CDN: hazırsa 6 sa + 1 g swr.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { getRefereeReport } from '@/server/people/refereeReport';

export const config = { maxDuration: 30 };

const ID = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = String(req.query.id ?? '');
  if (!ID.test(id)) return res.status(400).json({ error: 'Geçersiz parametre' });
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`referee-report:${ip}`, 20, 60_000, { memoryFallback: true });
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const result = await getRefereeReport(Number(id));
  if (result.status === 'ready') {
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(result);
  }
  res.setHeader('Cache-Control', result.status === 'pending' ? 'no-store' : 'public, s-maxage=600, stale-while-revalidate=600');
  return res.status(result.status === 'pending' ? 202 : 404).json(result);
}
