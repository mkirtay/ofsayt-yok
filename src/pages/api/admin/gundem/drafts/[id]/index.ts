/** PATCH /api/admin/gundem/drafts/[id] {body} — bekleyen taslağın metnini düzenler (ADMIN; yalnızca PENDING, 280 sınırı). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { requireAdmin } from '@/lib/requireAuth';
import { queryString, readJsonBody } from '@/lib/gundem/validation';
import { editDraftBody } from '@/lib/gundem/bot/draftActions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = queryString(req.query.id);
  if (!id) return res.status(400).json({ error: 'Geçersiz taslak kimliği.' });
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).end();
  }
  try {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
    const result = await editDraftBody(id, readJsonBody(req).body);
    return result.ok ? res.json({ draft: result.draft }) : res.status(result.status).json({ error: result.error });
  } catch (e) {
    captureError('gundem:draft-edit', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
