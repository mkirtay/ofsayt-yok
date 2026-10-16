/**
 * GET /api/admin/users?q= — yönetici: kullanıcı arama (e-posta / kullanıcı adı / id) → `{ users }`.
 * GET /api/admin/users?cursor= (q yok) — tüm kullanıcılar, en yeni üstte, 50'şer → `{ users, nextCursor }`.
 * Yalnız ADMIN (middleware + requireAdmin: oturumsuz 401, ADMIN değil 403). Yanıtta şifre / belirteç yok.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { listUsers, searchUsers } from '@/lib/adminUsers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  res.setHeader('Cache-Control', 'private, no-store');
  if (typeof req.query.q === 'string') return res.status(200).json({ users: await searchUsers(req.query.q) });
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length <= 64 ? req.query.cursor : null;
  return res.status(200).json(await listUsers(cursor));
}
