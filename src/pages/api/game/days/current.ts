/**
 * GET /api/game/days/current — bugünün (İstanbul) günlük oyunu ("Günün 3 maçı") + maçlar. Kişisel veri yok → CDN 60 sn.
 * Bugün oyun yoksa 200 `{ day: null }` ("bugün maç yok"; seri bozulmaz).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { limitRead, methodNotAllowed } from '@/server/game/http';
import { loadPublicDay, todayKey } from '@/server/game/days';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  if (!(await limitRead(req, res, 'day'))) return;
  try {
    const day = await loadPublicDay(todayKey());
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ day });
  } catch (err) {
    captureError('game-day-current', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
