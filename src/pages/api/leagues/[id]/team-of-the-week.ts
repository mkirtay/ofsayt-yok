/**
 * GET /api/leagues/{sportmonksLeagueId}/team-of-the-week — lig sayfası "Haftanın 11'i" sekmesi (bkz. server/teamOfTheWeek.ts).
 * Yalnız planın 34 ligi (config/hubLeagueGroups). 200 → CDN 1 sa + 12 sa swr; 404 (ligde yok / eski tur) → 1 sa;
 * Sportmonks hatası → 502 + no-store (hata "yok" diye önbelleğe girmez).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadTeamOfTheWeek } from '@/server/teamOfTheWeek';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

const INT = /^\d{1,9}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const raw = String(req.query.id ?? '');
  const leagueId = INT.test(raw) ? Number(raw) : NaN;
  if (!HUB_LEAGUE_IDS.includes(leagueId)) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.status(404).json({ error: 'Lig bulunamadı' });
  }
  if (!isSportmonksProviderEnabled()) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    return res.status(404).json({ error: 'Haftanın takımı yok' });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`team-of-the-week:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const totw = await loadTeamOfTheWeek(leagueId);
    if (!totw) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
      return res.status(404).json({ error: 'Haftanın takımı yok' });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=43200');
    return res.status(200).json(totw);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Veri şu an alınamıyor' });
  }
}
