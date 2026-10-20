/**
 * Admin — tek hafta. GET: hafta + maçlar + sayılar + aday maçlar (`?suggest=1`). PUT `{ fixtureIds: string[] }`: maç listesi
 * (taslak ya da yayında; sıra = dizi; snapshot alınır; haftayı kilitler → otomatik seçim dokunmaz). POST `{ action: 'publish' }`:
 * yayınla (1–10 maç). POST `{ action: 'unlock' }`: otomatiğe bırak.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { isWeekKey } from '@/lib/game/week';
import { requireAdmin } from '@/lib/requireAuth';
import { methodNotAllowed, queryString } from '@/server/game/http';
import { loadSuggestions } from '@/server/game/suggestions';
import { GameAdminError, loadAdminWeek, publishWeek, setWeekMatches, unlockWeek } from '@/server/game/weeks';
import { withGameGate } from '@/server/game/access';

const STATUS: Record<GameAdminError['code'], number> = {
  BAD_WEEK: 400,
  NOT_FOUND: 404,
  NOT_DRAFT: 409,
  BAD_MATCHES: 400,
  OUT_OF_WEEK: 400,
  STARTED: 409,
  SNAPSHOT: 502,
  PAST: 409,
  HAS_PREDICTIONS: 409,
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PUT', 'POST'].includes(req.method ?? '')) return methodNotAllowed(res, 'GET, PUT, POST');
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const weekKey = queryString(req, 'weekKey');
  if (!isWeekKey(weekKey)) return res.status(400).json({ error: 'Geçersiz hafta.' });
  try {
    if (req.method === 'GET') {
      const week = await loadAdminWeek(weekKey);
      const suggestions = queryString(req, 'suggest') === '1' ? await loadSuggestions(weekKey) : null;
      return res.status(200).json({ week, suggestions });
    }
    const body = readJsonBody(req);
    if (req.method === 'PUT') {
      const ids = body.fixtureIds;
      if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string' && typeof x !== 'number')) return res.status(400).json({ error: 'fixtureIds gerekli.' });
      return res.status(200).json({ week: await setWeekMatches(weekKey, ids.map(String)) });
    }
    if (body.action === 'unlock') return res.status(200).json({ week: await unlockWeek(weekKey) });
    if (body.action !== 'publish') return res.status(400).json({ error: 'Geçersiz işlem.' });
    return res.status(200).json({ week: await publishWeek(weekKey, guard.userId) });
  } catch (err) {
    if (err instanceof GameAdminError) return res.status(STATUS[err.code]).json({ error: err.message, code: err.code });
    captureError('admin-game-week', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
