/** GET /api/game/weeks/[weekKey] — yayındaki hafta + maçlar (taslak → 404). Kişisel veri yok → CDN 60 sn. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { isWeekKey } from '@/lib/game/week';
import { limitRead, methodNotAllowed, queryString } from '@/server/game/http';
import { loadPublicWeek } from '@/server/game/weeks';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  const weekKey = queryString(req, 'weekKey');
  if (!isWeekKey(weekKey)) return res.status(400).json({ error: 'Geçersiz hafta.' });
  if (!(await limitRead(req, res, 'week'))) return;
  try {
    const week = await loadPublicWeek(weekKey);
    if (!week) return res.status(404).json({ error: 'Hafta bulunamadı.' });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ week });
  } catch (err) {
    captureError('game-week', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
