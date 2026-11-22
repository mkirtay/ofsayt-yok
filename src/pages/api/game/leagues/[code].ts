/**
 * Özel lig görünümü (büyüme raporu 2.2) — GET: sezon + hafta sıralaması (kodu bilen görür); DELETE: ayrıl (kurucuysa
 * lig silinir). Kişisel alanlar (member/owner) yüzünden önbellek kişisel.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { getRequestAuth } from '@/lib/mobileAuth';
import { limitRead, limitWrite, methodNotAllowed, queryString } from '@/server/game/http';
import { PRIVATE_CACHE, withGameGate } from '@/server/game/access';
import { LeagueError, leaveLeague, loadLeagueView, privateLeaguesEnabled } from '@/server/game/leagues';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!privateLeaguesEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'DELETE') return methodNotAllowed(res, 'GET, DELETE');
  res.setHeader('Cache-Control', PRIVATE_CACHE);
  const code = queryString(req, 'code');
  try {
    if (req.method === 'GET') {
      if (!(await limitRead(req, res, 'league'))) return;
      const auth = await getRequestAuth(req, res);
      const view = await loadLeagueView(code, auth?.id ?? null);
      return view ? res.status(200).json(view) : res.status(404).json({ error: 'Lig bulunamadı.' });
    }
    const guard = await requireAuth(req, res);
    if (!guard.ok) return;
    if (!(await limitWrite(req, res, guard.userId))) return;
    const view = await loadLeagueView(code, guard.userId);
    if (!view) return res.status(404).json({ error: 'Lig bulunamadı.' });
    return res.status(200).json(await leaveLeague(guard.userId, view.id));
  } catch (err) {
    if (err instanceof LeagueError) return res.status(400).json({ error: err.message, code: err.code });
    captureError('game-league', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
