/**
 * POST /api/admin/moderation/actions — yönetici işlemi: `{ action, targetKey?, userId?, days?, note? }`.
 * action: HIDE | UNHIDE | DELETE | DISMISS | WARN | SUSPEND (days: 1–365, null = kalıcı) | UNSUSPEND. Denetim kaydına yazılır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { captureError } from '@/lib/logger';
import { readJsonBody } from '@/lib/gundem/validation';
import { ADMIN_ACTIONS, performAdminAction, type AdminAction } from '@/lib/moderation/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  const b = readJsonBody(req);
  const action = typeof b.action === 'string' ? b.action.toUpperCase() : '';
  if (!(ADMIN_ACTIONS as readonly string[]).includes(action)) return res.status(400).json({ error: 'Geçersiz işlem.' });
  const str = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : null);
  try {
    const result = await performAdminAction(guard.userId, {
      action: action as AdminAction,
      targetKey: str(b.targetKey),
      userId: str(b.userId),
      days: typeof b.days === 'number' ? b.days : null,
      note: str(b.note),
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json(result);
  } catch (e) {
    captureError('admin:moderation-action', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
