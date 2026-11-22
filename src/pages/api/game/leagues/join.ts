/** Özel lige davet koduyla katıl (büyüme raporu 2.2) — POST { code }. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { readJsonBody } from '@/lib/gundem/validation';
import { limitWrite, methodNotAllowed } from '@/server/game/http';
import { PRIVATE_CACHE, withGameGate } from '@/server/game/access';
import { joinLeague, LeagueError, privateLeaguesEnabled } from '@/server/game/leagues';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!privateLeaguesEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  res.setHeader('Cache-Control', PRIVATE_CACHE);
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  if (!(await limitWrite(req, res, guard.userId))) return;
  try {
    const body = readJsonBody(req) as { code?: unknown } | null;
    return res.status(200).json({ league: await joinLeague(guard.userId, body?.code) });
  } catch (err) {
    if (err instanceof LeagueError) return res.status(err.code === 'NOT_FOUND' ? 404 : 400).json({ error: err.message, code: err.code });
    captureError('game-leagues-join', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
