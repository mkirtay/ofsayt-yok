/** GET /api/national/teams/[id] — sade milli takım sayfası verisi (id = kaydırılmış takım id'si). Bayrak kapalıyken 404. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { nationalMatchesEnabled } from '@/config/nationalMatches';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadNationalTeam } from '@/server/apiFootball/nationalTeam';
import { isNationalMatchId } from '@/services/apiFootball/ids';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!nationalMatchesEnabled() || !isNationalMatchId(id)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Bulunamadı' });
  }
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`national-team:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const r = await loadNationalTeam(id);
  if (r.kind === 'error') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Takım verisi şu an alınamıyor.' });
  }
  if (r.kind === 'missing') {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(404).json({ error: 'Takım bulunamadı' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
  return res.status(200).json(r.data);
}
