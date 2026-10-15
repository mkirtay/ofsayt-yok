/** GET /api/admin/moderation/log — yönetici işlem kaydı (son 100). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { captureError } from '@/lib/logger';
import { listModerationLog } from '@/lib/moderation/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ items: await listModerationLog() });
  } catch (e) {
    captureError('admin:moderation-log', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
