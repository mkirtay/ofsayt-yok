/**
 * Yönetici: kupon yönetimi. GET → `{ coupons }`; POST `{ code, credits, maxRedemptions?, expiresAt?, note? }` → oluşturur;
 * PATCH `{ id, active }` → açar / kapatır. Yalnız ADMIN (middleware + requireAdmin).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { CouponInputError, createCoupon, listCoupons, setCouponActive } from '@/lib/coupons';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST', 'PATCH'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;
  if (req.method === 'GET') return res.status(200).json({ coupons: await listCoupons() });
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (req.method === 'PATCH') {
    if (typeof body.id !== 'string' || typeof body.active !== 'boolean') return res.status(400).json({ error: 'id ve active gerekli.' });
    if (!(await setCouponActive(body.id, body.active))) return res.status(404).json({ error: 'Kupon bulunamadı.' });
    return res.status(200).json({ ok: true });
  }
  try {
    return res.status(201).json({ coupon: await createCoupon(body as { code: unknown; credits: unknown }) });
  } catch (err) {
    if (err instanceof CouponInputError) return res.status(400).json({ error: err.message });
    throw err;
  }
}
