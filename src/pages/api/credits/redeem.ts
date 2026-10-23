/**
 * POST /api/credits/redeem { code } — kupon kodunu bozar (+kredi). Giriş gerekir; deneme sınırı kod tahminini yavaşlatır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/requireAuth';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { CouponError, redeemCoupon, type CouponErrorCode } from '@/lib/coupons';

/** Kullanıcı başına 10 dk'da en çok 10 deneme. */
const LIMIT = 10;
const WINDOW_MS = 10 * 60_000;

const MESSAGES: Record<CouponErrorCode, string> = {
  INVALID: 'Geçersiz kupon kodu.',
  EXPIRED: 'Bu kuponun süresi dolmuş.',
  EXHAUSTED: 'Bu kuponun kullanım hakkı dolmuş.',
  ALREADY_USED: 'Bu kuponu zaten kullandın.',
  EMAIL_NOT_VERIFIED: 'Kupon kullanmak için önce e-posta adresini doğrula.',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  const rl = await hitFixedWindowRateLimit(`credits:redeem:${guard.userId}`, LIMIT, WINDOW_MS);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Çok fazla deneme. Lütfen biraz sonra tekrar dene.', code: 'RATE_LIMITED' });
  }
  try {
    const { credits, balance } = await redeemCoupon(guard.userId, (req.body ?? {}).code);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ ok: true, credits: balance, added: credits });
  } catch (err) {
    if (err instanceof CouponError) return res.status(400).json({ error: MESSAGES[err.code], code: err.code });
    throw err;
  }
}
