/**
 * Admin — Günün 3 maçı. GET (satır AÇMAZ): gün + maçlar + aday maçlar (`?suggest=1`; ilk 3 = otomatik öneri). PUT
 * `{ fixtureIds }`: günün listesi (en çok 3; gün yoksa açılır; geçmiş gün 409 PAST; başlamış / tahmin almış maç çıkarılamaz).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { isDayKey } from '@/lib/game/week';
import { requireAdmin } from '@/lib/requireAuth';
import { methodNotAllowed, queryString } from '@/server/game/http';
import { loadAdminDay, loadDaySuggestions, setDayMatches } from '@/server/game/days';
import { invalidateDayLeaderboard } from '@/server/game/play';
import { GameAdminError } from '@/server/game/weeks';
import { withGameGate } from '@/server/game/access';

const STATUS: Partial<Record<GameAdminError['code'], number>> = { BAD_WEEK: 400, BAD_MATCHES: 400, OUT_OF_WEEK: 400, STARTED: 409, SNAPSHOT: 502, PAST: 409, HAS_PREDICTIONS: 409 };

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PUT') return methodNotAllowed(res, 'GET, PUT');
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const dayKey = queryString(req, 'dayKey');
  if (!isDayKey(dayKey)) return res.status(400).json({ error: 'Geçersiz gün.' });
  try {
    if (req.method === 'GET') {
      const day = await loadAdminDay(dayKey);
      const suggestions = queryString(req, 'suggest') === '1' ? await loadDaySuggestions(dayKey) : null;
      return res.status(200).json({ day, suggestions });
    }
    const ids = readJsonBody(req).fixtureIds;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string' && typeof x !== 'number')) return res.status(400).json({ error: 'fixtureIds gerekli.' });
    const day = await setDayMatches(dayKey, ids.map(String));
    await invalidateDayLeaderboard(dayKey);
    return res.status(200).json({ day });
  } catch (err) {
    if (err instanceof GameAdminError) return res.status(STATUS[err.code] ?? 400).json({ error: err.message, code: err.code });
    captureError('admin-game-day', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
