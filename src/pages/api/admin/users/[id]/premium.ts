/** POST /api/admin/users/{id}/premium { until: ISO | null, note } — yönetici: premium ver / kaldır (denetim izli). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { AdminInputError, adminSetPremium } from '@/lib/adminUsers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const { until, note } = (req.body ?? {}) as { until?: unknown; note?: unknown };
  try {
    const premiumUntil = await adminSetPremium(guard.userId, String(req.query.id), until ?? null, note);
    return res.status(200).json({ premiumUntil: premiumUntil?.toISOString() ?? null });
  } catch (e) {
    if (e instanceof AdminInputError) return res.status(400).json({ error: e.message });
    if ((e as { code?: string }).code === 'P2025') return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    throw e;
  }
}
