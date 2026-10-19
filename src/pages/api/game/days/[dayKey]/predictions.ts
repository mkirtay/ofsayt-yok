/**
 * PUT /api/game/days/[dayKey]/predictions — günlük oyun toplu tahmin kaydı. Gövde: `{ items: [{ gameMatchId, home, away }] }`
 * (joker yok; alan gönderilirse yok sayılır). Kilit ve yanıt kodları haftalıkla aynı (weeks/[weekKey]/predictions.ts). Maç
 * haftalık listede de varsa aynı tahmin orada da sayılır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { isDayKey } from '@/lib/game/week';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { limitWrite, methodNotAllowed, NICKNAME_REQUIRED_CODE, queryString } from '@/server/game/http';
import { parseSaveBody, saveDayPredictions } from '@/server/game/play';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') return methodNotAllowed(res, 'PUT');
  res.setHeader('Cache-Control', 'private, no-store');
  const dayKey = queryString(req, 'dayKey');
  if (!isDayKey(dayKey)) return res.status(400).json({ error: 'Geçersiz gün.' });
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  if (!(await limitWrite(req, res, guard.userId))) return;
  const parsed = parseSaveBody(readJsonBody(req));
  if (!parsed || !parsed.items.length) return res.status(400).json({ error: 'Geçersiz tahmin.', code: 'BAD_BODY' });
  try {
    const user = await prisma.user.findUnique({ where: { id: guard.userId }, select: { username: true } });
    if (!user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    if (!user.username) return res.status(403).json({ error: 'Tahmin için bir takma ad seç.', code: NICKNAME_REQUIRED_CODE });
    const result = await saveDayPredictions(guard.userId, dayKey, { items: parsed.items });
    if (!result) return res.status(404).json({ error: 'Bugünün oyunu tahmine açık değil.', code: 'DAY_CLOSED' });
    return res.status(200).json(result);
  } catch (err) {
    captureError('game-day-predictions', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
