/**
 * GET /api/matches/derby?home={teamId}&away={teamId} → `{ derby: boolean }` (bkz. server/teamRivals.ts).
 * Rakip listeleri 24 sa cache'li; sonuç takım çiftine bağlı → CDN 12 sa + 1 gün swr.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadIsDerby } from '@/server/teamRivals';

const INT = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const home = String(req.query.home ?? '');
  const away = String(req.query.away ?? '');
  if (!INT.test(home) || !INT.test(away)) return res.status(400).json({ error: 'Geçersiz parametre' });
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`derby:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const derby = await loadIsDerby(Number(home), Number(away));
  if (derby == null) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Rakip bilgisi şu an alınamıyor' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
  return res.status(200).json({ derby });
}
