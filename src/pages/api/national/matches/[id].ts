/**
 * GET /api/national/matches/[id] — milli maç (API-Football) için BFF: maç + olaylar + istatistik + kadro tek yanıtta.
 * Tarayıcı AF'ye gitmez; anahtar yalnız sunucuda. Bayrak kapalıyken 404 (bkz. config/nationalMatches.ts).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { nationalMatchesEnabled } from '@/config/nationalMatches';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { lookupNationalMatch } from '@/server/apiFootball/nationalMatch';
import { isNationalMatchId } from '@/services/apiFootball/ids';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!nationalMatchesEnabled() || !isNationalMatchId(id)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Maç bulunamadı' });
  }
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`national-match:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const lookup = await lookupNationalMatch(id);
  if (lookup.kind === 'error') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Maç verisi şu an alınamıyor.' });
  }
  if (lookup.kind === 'missing') {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(404).json({ error: 'Maç bulunamadı' });
  }
  const finished = lookup.bundle.match.status === 'FINISHED';
  res.setHeader('Cache-Control', finished ? 'public, s-maxage=600, stale-while-revalidate=600' : 'public, s-maxage=30, stale-while-revalidate=30');
  return res.status(200).json(lookup.bundle);
}
