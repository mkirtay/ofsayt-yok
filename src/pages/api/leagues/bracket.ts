/**
 * GET /api/leagues/bracket?league={sportmonksLeagueId}[&season={seasonId}] → `{ bracket: CupBracket | null }`
 * (bkz. server/cupBracket.ts). `bracket: null` = sezonda eleme verisi yok (istemci sekmeyi gizler).
 * CDN: ham verinin taze süresi kadar (canlı eleme maçı 5 dk … biten sezon 30 gün). Hata → 503, cache'lenmez
 * (hata ≠ veri yok).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadCupBracket } from '@/server/cupBracket';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

const INT = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const league = String(req.query.league ?? '');
  const season = req.query.season == null ? '' : String(req.query.season);
  if (!INT.test(league) || (season !== '' && !INT.test(season))) return res.status(400).json({ error: 'Geçersiz parametre' });
  if (!isSportmonksProviderEnabled()) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(200).json({ bracket: null });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`cup-bracket:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value, stale, failed } = await trackSportmonksFetches(() => loadCupBracket(Number(league), season ? Number(season) : null));
    if (!value.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(404).json({ error: value.reason });
    }
    if (failed) throw new Error('sportmonks failed');
    const fresh = stale ? 60 : value.freshSeconds;
    res.setHeader('Cache-Control', `public, s-maxage=${fresh}, stale-while-revalidate=${Math.max(300, fresh * 3)}`);
    return res.status(200).json({ bracket: value.bracket });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Eleme ağacı şu an alınamıyor' });
  }
}
