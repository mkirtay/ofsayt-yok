/**
 * GET /api/payments/hikie/callback — Hikie ödeme sonucu (isSuccess, status, orderId, merchantOrderId, timestamp,
 * signature). Doğrulama ve işlem server/payments/paymentOrders.ts → handleHikieCallback. Oturum gerekmez (imza
 * doğrular); middleware bu yolu kapsamaz. Log'a imza / secret yazılmaz.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { handleHikieCallback } from '@/server/payments/paymentOrders';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await handleHikieCallback(req.query);
    if (result.status !== 200) {
      const m = typeof req.query.merchantOrderId === 'string' ? req.query.merchantOrderId : '-';
      console.warn(`[payments] callback reddedildi: ${result.status} ${String(result.body.error)} (merchantOrderId=${m})`);
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[payments] callback hatası', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal' });
  }
}
