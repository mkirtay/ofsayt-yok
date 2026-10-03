/** GET /api/admin/users/{id}?before=ISO — yönetici: kullanıcı ayrıntısı, kredi hareketleri (sayfalı), premium geçmişi. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { getUserDetail } from '@/lib/adminUsers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  res.setHeader('Cache-Control', 'private, no-store');
  const before = typeof req.query.before === 'string' ? new Date(req.query.before) : undefined;
  const detail = await getUserDetail(String(req.query.id), {
    ...(before && Number.isFinite(before.getTime()) ? { before } : {}),
  });
  if (!detail) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  return res.status(200).json(detail);
}
