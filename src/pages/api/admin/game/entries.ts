/**
 * Admin — oyuncuyu bir haftanın (ve dolayısıyla sezonun) sıralamasından gizle / geri aç. POST `{ weekKey, username, hidden }`.
 * Satır silinmez (kötüye kullanım incelemesi için iz kalır).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { isWeekKey } from '@/lib/game/week';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAuth';
import { methodNotAllowed } from '@/server/game/http';
import { invalidateLeaderboards } from '@/server/game/play';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const { weekKey, username, hidden } = readJsonBody(req);
  if (!isWeekKey(weekKey) || typeof username !== 'string' || typeof hidden !== 'boolean') return res.status(400).json({ error: 'Geçersiz istek.' });
  try {
    const [week, user] = await Promise.all([
      prisma.gameWeek.findUnique({ where: { weekKey }, select: { id: true, season: true } }),
      prisma.user.findUnique({ where: { username: username.trim() }, select: { id: true } }),
    ]);
    if (!week || !user) return res.status(404).json({ error: 'Hafta ya da kullanıcı yok.' });
    const r = await prisma.gameWeekEntry.updateMany({ where: { weekId: week.id, userId: user.id }, data: { hiddenAt: hidden ? new Date() : null } });
    if (!r.count) return res.status(404).json({ error: 'Kullanıcı bu haftada oynamamış.' });
    await invalidateLeaderboards(weekKey, week.season);
    return res.status(200).json({ ok: true });
  } catch (err) {
    captureError('admin-game-entries', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
