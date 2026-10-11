/**
 * GET /api/game/leaderboard?scope=week|season&key=2026-W42|2026-27 — ilk 50 (takma ad + puan + tam skor + doğru yön).
 * Yalnız takma adı olan, e-postası doğrulanmış, gizlenmemiş oyuncular. Redis 60 sn + CDN 60 sn.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isSeasonKey, isWeekKey } from '@/lib/game/week';
import { limitRead, methodNotAllowed, queryString } from '@/server/game/http';
import { LEADERBOARD_CACHE_SECONDS, loadLeaderboard } from '@/server/game/play';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  const scope = queryString(req, 'scope');
  const key = queryString(req, 'key');
  if (!(scope === 'week' && isWeekKey(key)) && !(scope === 'season' && isSeasonKey(key))) return res.status(400).json({ error: 'Geçersiz tablo.' });
  if (!(await limitRead(req, res, 'lb'))) return;
  try {
    const board = await loadLeaderboard(scope, key!);
    if (!board) return res.status(404).json({ error: 'Tablo bulunamadı.' });
    res.setHeader('Cache-Control', `public, s-maxage=${LEADERBOARD_CACHE_SECONDS}, stale-while-revalidate=120`);
    return res.status(200).json(board);
  } catch (err) {
    captureError('game-leaderboard', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
