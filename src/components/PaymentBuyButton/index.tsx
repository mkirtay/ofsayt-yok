import { useState } from 'react';
import Router from 'next/router';
import { useSession } from 'next-auth/react';

/** Son başlatılan ödemenin kimliği: sonuç sayfası hangi siparişi yoklayacağını buradan da bilir (karar sunucuda). */
export const LAST_PAYMENT_KEY = 'oy_last_payment';

type Labels = { buy: string; loading: string; soon: string; error: string; unavailable: string };

/**
 * Hikie ödemesi başlatır: oturum yoksa girişe (dönüş /credits), varsa POST /api/payments/checkout → Hikie'ye yönlenir.
 * Satışta olmayan paket "Yakında" (devre dışı) kalır.
 */
export default function PaymentBuyButton({
  packageKey,
  available,
  labels,
  className,
  activeClassName,
  errorClassName,
}: {
  packageKey: string;
  available: boolean;
  labels: Labels;
  className: string;
  activeClassName: string;
  errorClassName: string;
}) {
  const { status } = useSession();
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
    if (status !== 'authenticated') {
      void Router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/credits')}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packageKey }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; merchantOrderId?: string; code?: string };
      if (!res.ok || !body.url) {
        setError(body.code === 'UNAVAILABLE' ? labels.unavailable : labels.error);
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
      <button type="button" className={`${className} ${activeClassName}`} onClick={() => void start()} disabled={busy} aria-busy={busy}>
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
