/**
 * POST /api/matches/{id}/view — maç detayı görüntülenmesini sayar (gövdesiz, 204). Bkz. config/matchCounters.ts.
 *
 * Maç sayfası CDN'de önbellekli olduğundan sayım SSR'da değil, istemciden bu hafif istekle yapılır. Botlar (UA),
 * aynı izleyicinin 30 dk içindeki tekrarları ve IP başına dakikada 30'u aşan istekler sayılmaz. Sayı yanıtta dönmez.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS, isCounterBot, parseCounterMatchId } from '@/config/matchCounters';
import { recordMatchView, viewerFingerprint } from '@/server/matchCounters';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const matchId = parseCounterMatchId(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id);
  if (!matchId) return res.status(400).end();

  const ua = req.headers['user-agent'] ?? '';
  // Botlara da 204: neyin sayılmadığı belli edilmez.
  if (isCounterBot(ua)) return res.status(204).end();

  try {
    const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
    const rl = await hitFixedWindowRateLimit(`match-view:ip:${ip}`, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS);
    if (!rl.success) return res.status(204).end();
    await recordMatchView(matchId, viewerFingerprint(ip, ua));
  } catch (e) {
    captureError('matches:view', e);
  }
  return res.status(204).end();
}
