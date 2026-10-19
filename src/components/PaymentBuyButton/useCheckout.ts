import { useCallback, useState } from 'react';
import Router from 'next/router';
import { useSession } from 'next-auth/react';
import { useI18n } from '@/lib/i18n';
import { PURCHASE_TERMS_VERSION } from '@/config/legalConsent';

/** Son başlatılan ödemenin kimliği: sonuç sayfası hangi siparişi yoklayacağını buradan da bilir (karar sunucuda). */
export const LAST_PAYMENT_KEY = 'oy_last_payment';

/** Hesap onayı sayfası (lib/termsConsentGate.ts TERMS_CONSENT_PAGE; o modül sunucu tarafı, istemciye alınmaz). */
const ACCOUNT_TERMS_PAGE = '/auth/onay';

/** Checkout isteği gövdesi: onay + sunucunun beklediği metin sürümü + e-posta dili. */
export function checkoutRequestBody(packageKey: string, locale: string) {
  return { packageKey, acceptedTerms: true as const, termsVersion: PURCHASE_TERMS_VERSION, locale: locale === 'en' ? 'en' : 'tr' };
}

export type CheckoutErrorKind = 'unavailable' | 'termsRequired' | 'error';

/**
 * Hikie ödemesi başlatır: oturum yoksa girişe (dönüş `returnTo`), varsa POST /api/payments/checkout → Hikie'ye yönlenir.
 * Hesap onayı eksikse onay sayfasına. Satın alma onayını (kutu) çağıran sağlar; sunucu yine doğrular.
 */
export function useCheckout(returnTo: string) {
  const { status } = useSession();
  const { locale } = useI18n();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<CheckoutErrorKind | null>(null);

  const start = useCallback(
    async (packageKey: string) => {
      if (status !== 'authenticated') {
        void Router.push(`/auth/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
        return;
      }
      setBusyKey(packageKey);
      setError(null);
      try {
        const res = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(checkoutRequestBody(packageKey, locale)),
        });
        const body = (await res.json().catch(() => ({}))) as { url?: string; merchantOrderId?: string; code?: string };
        if (res.status === 403 && body.code === 'TERMS_REQUIRED') {
          void Router.push(`${ACCOUNT_TERMS_PAGE}?callbackUrl=${encodeURIComponent(returnTo)}`);
          return;
        }
        if (!res.ok || !body.url) {
          setError(
            body.code === 'UNAVAILABLE'
              ? 'unavailable'
              : body.code === 'PURCHASE_TERMS_REQUIRED' || body.code === 'PURCHASE_TERMS_OUTDATED'
                ? 'termsRequired'
                : 'error',
          );
          setBusyKey(null);
          return;
        }
        try {
          if (body.merchantOrderId) sessionStorage.setItem(LAST_PAYMENT_KEY, body.merchantOrderId);
        } catch {
          // depolama kapalı: sonuç sayfası son siparişi sunucudan bulur
        }
        window.location.assign(body.url);
      } catch {
        setError('error');
        setBusyKey(null);
      }
    },
    [status, locale, returnTo],
  );

  return { start, busyKey, error };
}
