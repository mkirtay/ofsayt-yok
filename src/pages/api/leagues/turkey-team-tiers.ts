/**
 * GET /api/leagues/turkey-team-tiers — takım id → Türkiye lig kademesi (kupa maçı rozeti).
 * Kaynak ve maliyet: bkz. server/turkeyTeamTiers.ts (4 puan tablosu, paylaşımlı cache; takım başına istek yok).
 * CDN 24 sa; bir lig okunamadıysa 5 dk; hiç veri yoksa cache'lenmez (boş harita 24 saat kalmasın).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { loadTurkeyTeamTiers } from '@/server/turkeyTeamTiers';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

const DAY = 86_400;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isSportmonksProviderEnabled()) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(200).json({ tiers: {} });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`turkey-team-tiers:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value } = await trackSportmonksFetches(() => loadTurkeyTeamTiers());
    const empty = Object.keys(value.payload.tiers).length === 0;
    if (empty) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Kademe verisi şu an alınamıyor.' });
    }
    res.setHeader(
      'Cache-Control',
      value.complete ? `public, s-maxage=${DAY}, stale-while-revalidate=${DAY}` : 'public, s-maxage=300, stale-while-revalidate=600',
    );
    return res.status(200).json(value.payload);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
