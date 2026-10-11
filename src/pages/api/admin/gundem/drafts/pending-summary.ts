/** GET /api/admin/gundem/drafts/pending-summary — bekleyen taslakların toplamı ve tür/lig dağılımı (toplu ret filtreleri için; ADMIN). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { requireAdmin } from '@/lib/requireAuth';
import { loadPendingSummary } from '@/lib/gundem/bot/bulkReject';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
    return res.json(await loadPendingSummary());
  } catch (e) {
    captureError('gundem:drafts-pending-summary', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
