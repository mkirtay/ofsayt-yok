/**
 * GET /api/payments/hikie/callback — Hikie Checkout Link callback'i (status, isSuccess, orderId, merchantOrderId; İMZA
 * YOK). Kredi / premium ASLA burada verilmez (yalnız imzalı webhook): sipariş "callback geldi" diye işaretlenir ve
 * kullanıcı sonuç sayfasına 302 ile yönlendirilir. Oturum gerekmez; middleware bu yolu kapsamaz.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { handleHikieCallback } from '@/server/payments/paymentOrders';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let location = '/odeme/tamamlandi';
  try {
    location = (await handleHikieCallback(req.query)).location;
  } catch (err) {
    console.error('[payments] callback hatası', err instanceof Error ? err.message : err);
  }
  res.setHeader('Location', location);
  return res.status(302).end();
}
