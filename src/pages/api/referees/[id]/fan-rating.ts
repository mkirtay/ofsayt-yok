/**
 * GET /api/referees/{id}/fan-rating — hakem sayfası "Taraftar puanı" özeti (ortalama + oy sayısı + son puanlanan
 * maçlar). Yalnız DB (iki küçük sorgu, refereeId dizini); sayfanın ISR / SWR verisinden ayrı, istemcide çekilir → sayfa
 * önbelleği bozulmaz. CDN 5 dk + 10 dk swr.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadRefereeFanRating } from '@/server/refereeRating';

const ID = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = String(req.query.id ?? '');
  if (!ID.test(id)) return res.status(400).json({ error: 'Geçersiz parametre' });
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`referee-fan-rating:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const data = await loadRefereeFanRating(Number(id));
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json(data);
}
