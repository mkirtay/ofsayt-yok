/**
 * Admin — tek maç. POST `{ action: 'void', reason? }`: iptal (tahminler 0, joker yanar). POST `{ action: 'rescore', home, away }`:
 * normal süre sonucunu elle yaz / düzelt ve yeniden puanla (idempotent). Yalnız yayındaki / kapanmış haftalarda.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { isValidGoals } from '@/lib/game/scoring';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAuth';
import { methodNotAllowed, queryString } from '@/server/game/http';
import { invalidateLeaderboards } from '@/server/game/play';
import { finishMatch, voidMatch } from '@/server/game/settle';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const id = queryString(req, 'id');
  if (!id) return res.status(400).json({ error: 'Geçersiz maç.' });
  try {
    const m = await prisma.gameMatch.findUnique({ where: { id }, include: { week: { select: { weekKey: true, season: true, status: true } } } });
    if (!m || m.week.status === 'DRAFT') return res.status(404).json({ error: 'Maç bulunamadı.' });
    const body = readJsonBody(req);
    if (body.action === 'void') {
      await voidMatch(m, typeof body.reason === 'string' && body.reason.trim() ? `ADMIN:${body.reason.trim()}` : 'ADMIN');
    } else if (body.action === 'rescore') {
      if (!isValidGoals(body.home) || !isValidGoals(body.away)) return res.status(400).json({ error: 'Geçersiz skor.' });
      if (m.kickoffAt > new Date()) return res.status(409).json({ error: 'Maç henüz başlamadı.' });
      await finishMatch(m, body.home, body.away);
    } else return res.status(400).json({ error: 'Geçersiz işlem.' });
    // Hafta kapanmışsa tekrar açılmaz; açıktaysa sonuç işi kapatır.
    await invalidateLeaderboards(m.week.weekKey, m.week.season);
    return res.status(200).json({ ok: true });
  } catch (err) {
    captureError('admin-game-match', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
