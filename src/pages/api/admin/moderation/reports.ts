/** GET /api/admin/moderation/reports — yönetici: açık şikâyet kuyruğu (hedef başına grup, en eski önce) + sayaçlar. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { captureError } from '@/lib/logger';
import { listModerationStats, listOpenQueue } from '@/lib/moderation/admin';
import { REPORT_REVIEW_HOURS, reportHideThreshold } from '@/config/moderation';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    const [queue, stats] = await Promise.all([listOpenQueue(), listModerationStats()]);
    return res.json({ ...queue, stats, reviewHours: REPORT_REVIEW_HOURS, hideThreshold: reportHideThreshold() });
  } catch (e) {
    captureError('admin:moderation-reports', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
