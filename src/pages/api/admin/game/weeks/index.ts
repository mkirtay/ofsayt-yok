/**
 * Admin — tahmin oyunu haftaları. GET: son haftalar. POST `{ weekKey }`: taslak oluştur (varsa aynen döner).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { isWeekKey } from '@/lib/game/week';
import { requireAdmin } from '@/lib/requireAuth';
import { methodNotAllowed } from '@/server/game/http';
import { createDraftWeek, listAdminWeeks, loadAdminWeek } from '@/server/game/weeks';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, 'GET, POST');
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  try {
    if (req.method === 'GET') return res.status(200).json({ weeks: await listAdminWeeks() });
    const { weekKey } = readJsonBody(req);
    if (!isWeekKey(weekKey)) return res.status(400).json({ error: 'Geçersiz hafta.' });
    await createDraftWeek(weekKey);
    return res.status(200).json({ week: await loadAdminWeek(weekKey) });
  } catch (err) {
    captureError('admin-game-weeks', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
