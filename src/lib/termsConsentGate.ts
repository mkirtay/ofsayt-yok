/**
 * Kullanım Şartları + Gizlilik onayı kapısı (yazma uçları). Onayı olmayan hesap (Google ile ilk giriş, 2026-10-14 öncesi
 * kayıtlar, mobil kayıtlar) giriş yapabilir, okuyabilir, gezinebilir; yalnız analiz açma ve Gündem gönderi / yorum
 * (ileride satın alma) 403 `TERMS_REQUIRED` alır. Onay: /auth/onay → POST /api/user/terms-consent.
 *
 * MOBİL (Bearer) istekleri bu kapıdan MUAF: yayındaki mobil sürümlerde onay ekranı yok, kapı onları kilitlerdi. Mobil
 * için plan (sürüm kapısı + geçiş süresi): docs/HESAP_SILME_VE_ONAY.md §C1. Muafiyeti kaldırmak tek satır (aşağıda).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hasBearerToken } from '@/lib/mobileAuth';

export const TERMS_REQUIRED_CODE = 'TERMS_REQUIRED';
export const TERMS_REQUIRED_MESSAGE =
  "Devam etmek için Kullanım Şartları ve Gizlilik Politikası'nı onaylamalısın.";
/** Onay sayfası (istemci 403 TERMS_REQUIRED'da buraya bağlantı verir). */
export const TERMS_CONSENT_PAGE = '/auth/onay';

/** Kullanıcının kayıtlı onayı var mı (sürümden bağımsız: şimdilik tek sürüm; sürüm artınca yeniden onay ayrı karar). */
export async function hasAcceptedTerms(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { termsAcceptedAt: true } });
  return row?.termsAcceptedAt != null;
}

/**
 * Onay yoksa 403 yazar ve false döner (yanıt yazıldı → handler çıkmalı). Mobil Bearer istekleri muaf (dosya başı).
 * Kullanıcı satırı yoksa (silinmiş) burada engellemez — handler'ın kendi 401'i çalışır.
 */
export async function requireTermsConsent(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<boolean> {
  if (hasBearerToken(req)) return true;
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, termsAcceptedAt: true } });
  if (!row || row.termsAcceptedAt != null) return true;
  res.status(403).json({ error: TERMS_REQUIRED_MESSAGE, code: TERMS_REQUIRED_CODE });
  return false;
}
