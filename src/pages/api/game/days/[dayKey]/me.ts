/** GET /api/game/days/[dayKey]/me — günlük tahminlerim, puanım (jokersiz) ve günlük sıram. Kişiye özel → önbellek yok. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isDayKey } from '@/lib/game/week';
import { requireAuth } from '@/lib/requireAuth';
import { methodNotAllowed, queryString } from '@/server/game/http';
import { loadMyDay } from '@/server/game/play';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  res.setHeader('Cache-Control', 'private, no-store');
  const dayKey = queryString(req, 'dayKey');
  if (!isDayKey(dayKey)) return res.status(400).json({ error: 'Geçersiz gün.' });
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    const me = await loadMyDay(guard.userId, dayKey);
    if (!me) return res.status(404).json({ error: 'Gün bulunamadı.' });
    return res.status(200).json(me);
  } catch (err) {
    captureError('game-day-me', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
