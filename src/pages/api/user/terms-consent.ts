import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/mobileAuth';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { isTermsAccepted, TERMS_CONSENT_VERSION } from '@/config/legalConsent';

// Gövde tek alan (`acceptedTerms`); Next varsayılanı 1 MB yerine 4 KB.
export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };

/**
 * POST `{ acceptedTerms: true }` → User.termsAcceptedAt = şimdi, termsVersion = güncel sürüm (kayıt onayıyla aynı
 * alanlar). Google ile ilk giriş ve onaysız eski hesaplar için (/auth/onay). Web oturumu ya da mobil Bearer kabul edilir.
 * Zaten güncel sürümle onaylıysa kayıt değişmez (ilk onay zamanı korunur). Yanıt: `{ ok, termsVersion, termsAcceptedAt }`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const userId = await getRequestUserId(req, res);
  if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

  const rl = await hitFixedWindowRateLimit(`terms-consent:user:${userId}`, 10, 10 * 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Çok fazla istek. Biraz bekleyin.' });
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { acceptedTerms?: unknown };
  if (!isTermsAccepted(body.acceptedTerms)) {
    return res.status(400).json({
      error: "Devam etmek için Kullanım Şartları ve Gizlilik Politikası'nı onaylamalısın.",
      code: 'TERMS_REQUIRED',
    });
  }

  try {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { termsAcceptedAt: true, termsVersion: true } });
    if (!row) return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });
    if (row.termsAcceptedAt && row.termsVersion === TERMS_CONSENT_VERSION) {
      return res.status(200).json({ ok: true, termsVersion: row.termsVersion, termsAcceptedAt: row.termsAcceptedAt.toISOString() });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { termsAcceptedAt: new Date(), termsVersion: TERMS_CONSENT_VERSION },
      select: { termsAcceptedAt: true, termsVersion: true },
    });
    return res.status(200).json({
      ok: true,
      termsVersion: updated.termsVersion,
      termsAcceptedAt: updated.termsAcceptedAt?.toISOString() ?? null,
    });
  } catch (e) {
    captureError('user:terms-consent', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
