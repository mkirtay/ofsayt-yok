/**
 * POST /api/payments/checkout { packageKey } — oturum zorunlu. PENDING PaymentOrder oluşturur ve paketin Hikie
 * Checkout Link'ini (merchantOrderId eklenmiş) döner; istemci oraya yönlenir. Kredi burada VERİLMEZ (imzalı callback).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/requireAuth';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { CheckoutError, createCheckout } from '@/server/payments/paymentOrders';

/** Kullanıcı başına 10 dk'da en çok 10 checkout (sipariş tablosu şişmesin). */
const LIMIT = 10;
const WINDOW_MS = 10 * 60_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  const rl = await hitFixedWindowRateLimit(`payments:checkout:${guard.userId}`, LIMIT, WINDOW_MS);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.', code: 'RATE_LIMITED' });
  }
  const packageKey = (req.body as { packageKey?: unknown } | undefined)?.packageKey;
  try {
    const { url, merchantOrderId } = await createCheckout(guard.userId, packageKey);
    return res.status(200).json({ url, merchantOrderId });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return res.status(err.status).json({ error: err.code === 'UNAVAILABLE' ? 'Bu paket şu an satışta değil.' : 'Geçersiz paket.', code: err.code });
    }
    console.error('[payments] checkout hatası', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Ödeme başlatılamadı.' });
  }
}
