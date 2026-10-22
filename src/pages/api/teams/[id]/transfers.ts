/**
 * GET /api/teams/[id]/transfers — takımın son 12 aydaki Gelenler / Gidenler listesi (altyapı hareketleri süzülmüş; bkz.
 * server/teamTransfers.ts, services/sportmonks/teamTransfers.ts). Takım sayfasının "Transferler" sekmesi açılınca istenir.
 * CDN: 6 sa + 1 gün swr (arkada 12 sa SWR). Hata → 503 no-store (istemci "yüklenemedi · tekrar dene"; "transfer yok" DEMEZ).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { loadTeamTransfers } from '@/server/teamTransfers';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

export const TEAM_TRANSFERS_CACHE_CONTROL = 'public, s-maxage=21600, stale-while-revalidate=86400';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^\d{1,12}$/.test(id) || !isSportmonksProviderEnabled()) {
    return res.status(400).json({ error: 'Geçersiz takım' });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`team-transfers:${ip}`, 30, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value } = await trackSportmonksFetches(() => loadTeamTransfers(Number(id)));
    res.setHeader('Cache-Control', TEAM_TRANSFERS_CACHE_CONTROL);
    return res.status(200).json(value);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Transferler şu an alınamıyor.' });
  }
}
