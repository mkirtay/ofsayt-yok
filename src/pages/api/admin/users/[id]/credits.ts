/** POST /api/admin/users/{id}/credits { amount, note } — yönetici: kredi ekle / çıkar (atomik, gerekçe zorunlu). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { AdminInputError, adminAdjustCredits } from '@/lib/adminUsers';
import { InsufficientCreditsError } from '@/lib/credits';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const { amount, note } = (req.body ?? {}) as { amount?: unknown; note?: unknown };
  try {
    const credits = await adminAdjustCredits(guard.userId, String(req.query.id), amount, note);
    return res.status(200).json({ credits });
  } catch (e) {
    if (e instanceof AdminInputError) return res.status(400).json({ error: e.message });
    if (e instanceof InsufficientCreditsError) return res.status(409).json({ error: 'Bakiye bu kadar düşürülemez (eksiye inemez).' });
    if ((e as { code?: string }).code === 'P2025' || (e as Error).message === 'Kullanıcı bulunamadı') {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }
    throw e;
  }
}
