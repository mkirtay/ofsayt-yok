/** POST /api/admin/gundem/drafts/[id]/reject — bekleyen taslağı bekleyen taslağı reddeder (ADMIN). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { requireAdmin } from '@/lib/requireAuth';
import { queryString } from '@/lib/gundem/validation';
import { rejectDraft } from '@/lib/gundem/bot/draftActions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = queryString(req.query.id);
  if (!id) return res.status(400).json({ error: 'Geçersiz taslak kimliği.' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  try {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
    const result = await rejectDraft(id, guard.userId);
    return result.ok ? res.json({ draft: result.draft }) : res.status(result.status).json({ error: result.error, reason: result.reason });
  } catch (e) {
    captureError('gundem:draft-reject', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
