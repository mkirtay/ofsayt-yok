/**
 * Özel ligler (büyüme raporu 2.2) — GET: üye olduğum ligler; POST { name }: lig kur (kurucu otomatik üye).
 * Bayrak kapalıyken 404 (server/game/leagues.ts privateLeaguesEnabled).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { readJsonBody } from '@/lib/gundem/validation';
import { limitWrite, methodNotAllowed } from '@/server/game/http';
import { PRIVATE_CACHE, withGameGate } from '@/server/game/access';
import { createLeague, LeagueError, listMyLeagues, privateLeaguesEnabled } from '@/server/game/leagues';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!privateLeaguesEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, 'GET, POST');
  res.setHeader('Cache-Control', PRIVATE_CACHE);
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    if (req.method === 'GET') return res.status(200).json({ leagues: await listMyLeagues(guard.userId) });
    if (!(await limitWrite(req, res, guard.userId))) return;
    const body = readJsonBody(req) as { name?: unknown } | null;
    return res.status(201).json({ league: await createLeague(guard.userId, body?.name) });
  } catch (err) {
    if (err instanceof LeagueError) return res.status(400).json({ error: err.message, code: err.code });
    captureError('game-leagues', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
