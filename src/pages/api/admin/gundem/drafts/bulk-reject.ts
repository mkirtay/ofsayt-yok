/**
 * POST /api/admin/gundem/drafts/bulk-reject — bekleyen taslakları toplu reddeder (ADMIN). Silme yok: durum REJECTED.
 * Gövde (tam olarak biri): `{ ids: string[] }` | `{ kind?, league? }` | `{ all: true }`; `dryRun: true` → yalnız `{ count }`.
 * Yalnızca PENDING etkilenir; tek transaction. Bkz. lib/gundem/bot/bulkReject.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { requireAdmin } from '@/lib/requireAuth';
import { readJsonBody } from '@/lib/gundem/validation';
import { bulkRejectDrafts, countBulkReject, parseBulkBody } from '@/lib/gundem/bot/bulkReject';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  try {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
    const parsed = parseBulkBody(readJsonBody(req));
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    if (parsed.dryRun) return res.json({ count: await countBulkReject(parsed.selector) });
    return res.json(await bulkRejectDrafts(parsed.selector, guard.userId));
  } catch (e) {
    captureError('gundem:drafts-bulk-reject', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
