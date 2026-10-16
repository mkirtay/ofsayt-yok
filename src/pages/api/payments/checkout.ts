/**
 * POST /api/payments/checkout { packageKey, acceptedTerms: true, termsVersion, locale? } — oturum zorunlu (yalnız web;
 * mobilde satın alma yok). PENDING PaymentOrder oluşturur ve paketin Hikie Checkout Link'ini (merchantOrderId
 * eklenmiş) döner; istemci oraya yönlenir. Kredi burada VERİLMEZ (imzalı webhook).
 * Sıra: oturum → hız sınırı → hesap onayı (Kullanım Şartları, 403 TERMS_REQUIRED) → satın alma onayı (Ön Bilgilendirme +
 * Mesafeli Satış + cayma beyanı; yoksa 400 PURCHASE_TERMS_REQUIRED, eski sürüm 409 PURCHASE_TERMS_OUTDATED) → sipariş.
 * Onay zamanı ve sürümü siparişe yazılır (PaymentOrder.termsAcceptedAt / termsVersion).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/requireAuth';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { requireTermsConsent } from '@/lib/termsConsentGate';
import { CheckoutError, createCheckout } from '@/server/payments/paymentOrders';

const CHECKOUT_ERRORS: Record<CheckoutError['code'], string> = {
  UNKNOWN_PACKAGE: 'Geçersiz paket.',
  UNAVAILABLE: 'Bu paket şu an satışta değil.',
  PURCHASE_TERMS_REQUIRED: 'Devam etmek için Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onayı gerekir.',
  PURCHASE_TERMS_OUTDATED: 'Sözleşme metinleri güncellendi. Sayfayı yenileyip tekrar onaylayın.',
};

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
  // Hesap onayı kapısı (WEB-HESAP; mobil Bearer muaf — lib/termsConsentGate.ts). Satın alma onayından ayrı ve önce.
  if (!(await requireTermsConsent(req, res, guard.userId))) return;
  const body = (req.body ?? {}) as { packageKey?: unknown; acceptedTerms?: unknown; termsVersion?: unknown; locale?: unknown };
  try {
    const { url, merchantOrderId } = await createCheckout(guard.userId, body.packageKey, {
      accepted: body.acceptedTerms,
      version: body.termsVersion,
      locale: body.locale,
    });
    return res.status(200).json({ url, merchantOrderId });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return res.status(err.status).json({ error: CHECKOUT_ERRORS[err.code], code: err.code });
    }
    console.error('[payments] checkout hatası', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Ödeme başlatılamadı.' });
  }
}
