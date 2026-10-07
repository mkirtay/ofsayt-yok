/**
 * GET /api/frikik/me — oturumdaki kullanıcının bugünkü kaydı ve sırası, ay içindeki en iyisi ve aylık sırası, takma adı
 * (User.username). Kişiye özel → önbellek yok.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { todayKey } from '@/lib/frikik/daily';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { loadMyStanding } from '@/server/frikik/leaderboardService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    return res.status(200).json(await loadMyStanding(guard.userId, todayKey(Date.now())));
  } catch (err) {
    captureError('frikik-me', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
