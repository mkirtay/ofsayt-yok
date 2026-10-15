/**
 * Filtre sözlüğü ekleri (kod değişmeden): GET liste · POST `{ term, level: BLOCK|FLAG|ALLOW, match?, category? }` (aynı terim
 * güncellenir) · DELETE `?id=`. Temel liste src/config/moderationTerms.json'da; buradaki satırlar onu genişletir.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAuth';
import { captureError } from '@/lib/logger';
import { readJsonBody, queryString } from '@/lib/gundem/validation';
import { addModerationTerm, removeModerationTerm } from '@/lib/moderation/admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method === 'GET') {
      const terms = await prisma.moderationTerm.findMany({ orderBy: { createdAt: 'desc' } });
      return res.json({ terms });
    }
    if (req.method === 'POST') {
      const r = await addModerationTerm(guard.userId, readJsonBody(req));
      if (!r.ok) return res.status(400).json({ error: r.error });
      return res.status(201).json({ term: r.term });
    }
    if (req.method === 'DELETE') {
      const id = queryString(req.query.id);
      if (!id) return res.status(400).json({ error: 'Geçersiz kimlik.' });
      return (await removeModerationTerm(guard.userId, id)) ? res.status(204).end() : res.status(404).json({ error: 'Bulunamadı.' });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).end();
  } catch (e) {
    captureError('admin:moderation-terms', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
