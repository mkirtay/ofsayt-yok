/** GET /api/admin/users?q= — yönetici: kullanıcı arama (e-posta / kullanıcı adı / id). */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { searchUsers } from '@/lib/adminUsers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  res.setHeader('Cache-Control', 'private, no-store');
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  return res.status(200).json({ users: await searchUsers(q) });
}
