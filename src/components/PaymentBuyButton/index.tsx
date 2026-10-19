import { useState } from 'react';
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

type Labels = { buy: string; loading: string; soon: string; error: string; unavailable: string; termsRequired: string };

/**
 * Hikie ödemesi başlatır: oturum yoksa girişe (dönüş /pricing), varsa POST /api/payments/checkout → Hikie'ye yönlenir.
 * Satışta olmayan paket "Yakında" (devre dışı) kalır. Satın alma onayı (sayfadaki kutu: Ön Bilgilendirme + Mesafeli
 * Satış + cayma beyanı) işaretlenmeden düğme pasif; istek onay + metin sürümüyle gider, sunucu yine doğrular
 * (400 PURCHASE_TERMS_REQUIRED / 409 PURCHASE_TERMS_OUTDATED).
 */
export default function PaymentBuyButton({
  packageKey,
  available,
  termsAccepted,
  describedBy,
  labels,
  className,
  activeClassName,
  errorClassName,
}: {
  packageKey: string;
  available: boolean;
  termsAccepted: boolean;
  /** Onay kutusunun id'si (ekran okuyucu düğmenin neden pasif olduğunu duysun). */
  describedBy?: string;
  labels: Labels;
  className: string;
  activeClassName: string;
  errorClassName: string;
}) {
  const { status } = useSession();
  const { locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) {
    return (
      <button type="button" className={className} disabled>
        {labels.soon}
      </button>
    );
  }

  const start = async () => {
    if (!termsAccepted) return;
    if (status !== 'authenticated') {
      void Router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/pricing')}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(checkoutRequestBody(packageKey, locale)),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; merchantOrderId?: string; code?: string };
      if (res.status === 403 && body.code === 'TERMS_REQUIRED') {
        void Router.push(`${ACCOUNT_TERMS_PAGE}?callbackUrl=${encodeURIComponent('/pricing')}`);
        return;
      }
      if (!res.ok || !body.url) {
        setError(
          body.code === 'UNAVAILABLE'
            ? labels.unavailable
            : body.code === 'PURCHASE_TERMS_REQUIRED' || body.code === 'PURCHASE_TERMS_OUTDATED'
              ? labels.termsRequired
              : labels.error,
        );
        setBusy(false);
        return;
      }
      try {
        if (body.merchantOrderId) sessionStorage.setItem(LAST_PAYMENT_KEY, body.merchantOrderId);
      } catch {
        // depolama kapalı: sonuç sayfası son siparişi sunucudan bulur
      }
      window.location.assign(body.url);
    } catch {
      setError(labels.error);
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${className} ${activeClassName}`}
        onClick={() => void start()}
        disabled={busy || !termsAccepted}
        aria-busy={busy}
        aria-describedby={describedBy}
      >
        {busy ? labels.loading : labels.buy}
      </button>
      {error ? (
        <p className={errorClassName} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
