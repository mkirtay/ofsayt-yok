/**
 * GET /api/game/matches/[id]/distribution — topluluğun skor dağılımı. YALNIZ maç başladıktan sonra (önce 403 LOCKED_UNTIL_KICKOFF:
 * başkalarının tahmini başlama öncesi hiçbir uçta dönmez). Kişisel veri yok → CDN 60 sn.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { limitRead, methodNotAllowed, queryString } from '@/server/game/http';
import { loadDistribution } from '@/server/game/play';
import { withGameGate } from '@/server/game/access';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  const id = queryString(req, 'id');
  if (!id || !/^[a-z0-9]{8,40}$/i.test(id)) return res.status(400).json({ error: 'Geçersiz maç.' });
  if (!(await limitRead(req, res, 'dist'))) return;
  try {
    const out = await loadDistribution(id);
    if (out.kind === 'not-found') return res.status(404).json({ error: 'Maç bulunamadı.' });
    if (out.kind === 'locked') {
      res.setHeader('Cache-Control', 'public, s-maxage=30');
      return res.status(403).json({ error: 'Dağılım maç başlayınca açılır.', code: 'LOCKED_UNTIL_KICKOFF' });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(out.view);
  } catch (err) {
    captureError('game-distribution', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default withGameGate(handler);
