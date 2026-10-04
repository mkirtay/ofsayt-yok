/**
 * GET /api/payments/order?merchantOrderId= — kullanıcının KENDİ siparişinin durumu + güncel bakiye / premium (DB'den).
 * merchantOrderId yoksa son 24 saatteki en yeni sipariş. /odeme/tamamlandi bunu yoklar; karar burada verilmez.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/requireAuth';
import { getOrderStatusForUser } from '@/server/payments/paymentOrders';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  const raw = req.query.merchantOrderId;
  const merchantOrderId = typeof raw === 'string' && /^oy_[0-9a-f]{32}$/.test(raw) ? raw : null;
  const order = await getOrderStatusForUser(guard.userId, merchantOrderId);
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
  return res.status(200).json(order);
}
