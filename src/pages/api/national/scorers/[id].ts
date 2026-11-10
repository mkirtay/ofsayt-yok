/** GET /api/national/scorers/[id]?season= — milli turnuva gol / asist krallığı (id = kaydırılmış lig id'si). Bayrak kapalıyken 404. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { nationalMatchesEnabled } from '@/config/nationalMatches';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadNationalScorers } from '@/server/apiFootball/nationalStats';
import { isNationalMatchId } from '@/services/apiFootball/ids';

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = one(req.query.id);
  const season = Number(one(req.query.season));
  if (!nationalMatchesEnabled() || !isNationalMatchId(id)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Bulunamadı' });
  }
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`national-scorers:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const r = await loadNationalScorers(id, season);
  if (r.kind === 'error') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Şu an alınamıyor.' });
  }
  if (r.kind === 'missing') {
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    return res.status(404).json({ error: 'Veri yok' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=900');
  return res.status(200).json(r.data);
}
