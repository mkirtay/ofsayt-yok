/** GET /api/game/weeks/[weekKey]/me — tahminlerim, jokerim, puanım ve haftalık sıram. Kişiye özel → önbellek yok. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isWeekKey } from '@/lib/game/week';
import { requireAuth } from '@/lib/requireAuth';
import { methodNotAllowed, queryString } from '@/server/game/http';
import { loadMyWeek } from '@/server/game/play';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  res.setHeader('Cache-Control', 'private, no-store');
  const weekKey = queryString(req, 'weekKey');
  if (!isWeekKey(weekKey)) return res.status(400).json({ error: 'Geçersiz hafta.' });
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    const me = await loadMyWeek(guard.userId, weekKey);
    if (!me) return res.status(404).json({ error: 'Hafta bulunamadı.' });
    return res.status(200).json(me);
  } catch (err) {
    captureError('game-week-me', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
