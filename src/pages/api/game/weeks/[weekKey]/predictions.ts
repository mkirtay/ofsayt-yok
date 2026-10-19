/**
 * PUT /api/game/weeks/[weekKey]/predictions — toplu tahmin kaydı. Gövde: `{ items: [{ gameMatchId, home, away }],
 * jokerGameMatchId?: string | null }` (joker alanı yoksa joker değişmez; null → kaldır). KİLİT sunucuda, veritabanı saatiyle
 * (lib/game/sql.ts): başlamış / iptal maç kalemi `LOCKED` döner, diğerleri yazılır (kısmi başarı 200).
 * - 401 giriş yok · 403 NICKNAME_REQUIRED (takma ad yok; Frikik ile aynı akış) · 400 gövde / hafta · 404 hafta yayında değil
 * Hız sınırı: kullanıcı 20/dk, IP 60/dk.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { isWeekKey } from '@/lib/game/week';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { limitWrite, methodNotAllowed, NICKNAME_REQUIRED_CODE, queryString } from '@/server/game/http';
import { parseSaveBody, savePredictions } from '@/server/game/play';
import { withGameGate } from '@/server/game/access';

export { NICKNAME_REQUIRED_CODE };

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') return methodNotAllowed(res, 'PUT');
  res.setHeader('Cache-Control', 'private, no-store');
  const weekKey = queryString(req, 'weekKey');
  if (!isWeekKey(weekKey)) return res.status(400).json({ error: 'Geçersiz hafta.' });
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  if (!(await limitWrite(req, res, guard.userId))) return;
  const body = parseSaveBody(readJsonBody(req));
  if (!body) return res.status(400).json({ error: 'Geçersiz tahmin.', code: 'BAD_BODY' });
  try {
    const user = await prisma.user.findUnique({ where: { id: guard.userId }, select: { username: true } });
    if (!user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    if (!user.username) return res.status(403).json({ error: 'Tahmin için bir takma ad seç.', code: NICKNAME_REQUIRED_CODE });
    const result = await savePredictions(guard.userId, weekKey, body);
    if (!result) return res.status(404).json({ error: 'Bu hafta tahmine açık değil.', code: 'WEEK_CLOSED' });
    return res.status(200).json(result);
  } catch (err) {
    captureError('game-predictions', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
