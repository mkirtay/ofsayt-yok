/** GET /api/game/leaderboard/me?scope=week|season&key=… — puanım ve sıram (görünür değilsem sıra null). Önbellek yok. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isSeasonKey, isWeekKey } from '@/lib/game/week';
import { requireAuth } from '@/lib/requireAuth';
import { methodNotAllowed, queryString } from '@/server/game/http';
import { loadMyStanding } from '@/server/game/play';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  res.setHeader('Cache-Control', 'private, no-store');
  const scope = queryString(req, 'scope');
  const key = queryString(req, 'key');
  if (!(scope === 'week' && isWeekKey(key)) && !(scope === 'season' && isSeasonKey(key))) return res.status(400).json({ error: 'Geçersiz tablo.' });
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    const me = await loadMyStanding(guard.userId, scope, key!);
    if (!me) return res.status(404).json({ error: 'Tablo bulunamadı.' });
    return res.status(200).json(me);
  } catch (err) {
    captureError('game-leaderboard-me', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
