/**
 * GET /api/matches/[id]/live — maç detayının canlı güncellemesi (skor, durum, dakika, olaylar, istatistik).
 * Kaynak ve maliyet: bkz. server/liveMatch.ts (tüm canlı maçlar tek `livescores/inplay` çağrısından, paylaşımlı
 * cache 20 sn). CDN: canlıyken en çok 15 + 5 sn; canlı değilken 60 sn (istemci zaten durur).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { loadLiveMatch } from '@/server/liveMatch';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

export const LIVE_CACHE_CONTROL = 'public, s-maxage=15, stale-while-revalidate=5';
const NOT_LIVE_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=60';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^\d{1,12}$/.test(id) || !isSportmonksProviderEnabled()) {
    return res.status(400).json({ error: 'Geçersiz maç' });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`match-live:${ip}`, 120, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value, failed } = await trackSportmonksFetches(() => loadLiveMatch(id));
    if (!value) {
      if (failed) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(503).json({ error: 'Canlı veri şu an alınamıyor.' });
      }
      res.setHeader('Cache-Control', NOT_LIVE_CACHE_CONTROL);
      return res.status(404).json({ error: 'Maç bulunamadı' });
    }
    res.setHeader('Cache-Control', value.live ? LIVE_CACHE_CONTROL : NOT_LIVE_CACHE_CONTROL);
    return res.status(200).json(value);
  } catch {
    // Upstream hatası + cache'te (Redis) son geçerli veri yok: istemci üstel bekleyip yeniden dener.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Canlı veri şu an alınamıyor.' });
  }
}
