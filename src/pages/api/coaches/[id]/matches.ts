/**
 * GET /api/coaches/[id]/matches?page=1 — teknik direktör sayfasında "Daha fazla" (son 10'dan eski biten maçlar; sayfa başı 10,
 * en fazla 100 maç; bkz. server/people/coachPage.ts `loadCoachMatchesPage`). Aralık dışı sayfa → 404 (istemci düğmeyi kaldırır).
 * CDN: 6 sa + 1 gün swr. Hata → 503 no-store (istemci "yüklenemedi · tekrar dene"; "maç yok" DEMEZ).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { loadCoachMatchesPage } from '@/server/people/coachPage';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

export const COACH_MATCHES_CACHE_CONTROL = 'public, s-maxage=21600, stale-while-revalidate=86400';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const pageRaw = typeof req.query.page === 'string' ? req.query.page : '';
  if (!/^\d{1,12}$/.test(id) || !/^\d{1,2}$/.test(pageRaw) || !isSportmonksProviderEnabled()) {
    return res.status(400).json({ error: 'Geçersiz istek' });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`coach-matches:${ip}`, 30, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value } = await trackSportmonksFetches(() => loadCoachMatchesPage(Number(id), Number(pageRaw)));
    if (value === 'missing') {
      res.setHeader('Cache-Control', COACH_MATCHES_CACHE_CONTROL);
      return res.status(404).json({ error: 'Maç yok' });
    }
    if (!value) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Maçlar şu an alınamıyor.' });
    }
    res.setHeader('Cache-Control', COACH_MATCHES_CACHE_CONTROL);
    return res.status(200).json(value);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Maçlar şu an alınamıyor.' });
  }
}
