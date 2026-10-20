/**
 * GET /api/matches/[id]/commentary — maç anlatımı (bkz. server/matchCommentary.ts). Maç sayfasının "Anlatım" sekmesi
 * açılınca istenir; SSR'a girmez. CDN: canlı 30 + 30 sn (istemci 60 sn'de bir yeniler), yeni biten / başlamamış 5 dk,
 * 1 günden eski bitmiş maç 1 gün + 7 gün swr (Sportmonks kaydı 7 gün taze).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { loadMatchCommentary, type MatchCommentary } from '@/server/matchCommentary';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

const DAY = 86_400;

export function commentaryCacheControl(c: MatchCommentary, nowSec: number = Math.floor(Date.now() / 1000)): string {
  if (c.live) return 'public, s-maxage=30, stale-while-revalidate=30';
  if (c.phase === 'FINISHED' && c.kickoff != null && nowSec - c.kickoff > DAY) {
    return `public, s-maxage=${DAY}, stale-while-revalidate=${7 * DAY}`;
  }
  return 'public, s-maxage=300, stale-while-revalidate=300';
}

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
  const rl = await hitFixedWindowRateLimit(`match-commentary:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value } = await trackSportmonksFetches(() => loadMatchCommentary(Number(id)));
    if (!value) {
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
      return res.status(404).json({ error: 'Maç bulunamadı' });
    }
    res.setHeader('Cache-Control', commentaryCacheControl(value));
    return res.status(200).json({ items: value.items, live: value.live, squads: value.squads });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Anlatım şu an alınamıyor.' });
  }
}
