/**
 * GET /api/game/weeks/current — yayındaki "şu anki" hafta (bkz. resolveCurrentWeekKey) + maçlar. Kişisel veri yok → CDN 60 sn.
 * Hafta yoksa 200 `{ week: null }` (oyun henüz başlamadı).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { limitRead, methodNotAllowed } from '@/server/game/http';
import { loadPublicWeek, resolveCurrentWeekKey } from '@/server/game/weeks';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  if (!(await limitRead(req, res, 'week'))) return;
  try {
    const key = await resolveCurrentWeekKey();
    const week = key ? await loadPublicWeek(key) : null;
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ week });
  } catch (err) {
    captureError('game-week-current', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
