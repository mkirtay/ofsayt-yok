/**
 * GET /api/referees/{id}/summary?season={seasonId}&league={leagueId} — maç sayfası hakem kartı (bkz. server/refereeSummary.ts).
 * Yalnız sayılar; Sportmonks verisi 12 sa cache'li, CDN 1 sa + 12 sa swr.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadRefereeSummary } from '@/server/refereeSummary';

const INT = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = String(req.query.id ?? '');
  const season = String(req.query.season ?? '');
  const league = String(req.query.league ?? '');
  if (!INT.test(id) || !INT.test(season) || (league && !INT.test(league))) {
    return res.status(400).json({ error: 'Geçersiz parametre' });
  }
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`referee-summary:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const summary = await loadRefereeSummary(Number(id), Number(season), league ? Number(league) : null);
  if (!summary) {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
    return res.status(404).json({ error: 'Hakem istatistiği yok' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=43200');
  return res.status(200).json(summary);
}
