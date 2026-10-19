import { useCheckout, type CheckoutErrorKind } from './useCheckout';

export { LAST_PAYMENT_KEY, checkoutRequestBody } from './useCheckout';

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
  const { start, busyKey, error } = useCheckout('/pricing');
  const busy = busyKey !== null;

  if (!available) {
    return (
      <button type="button" className={className} disabled>
        {labels.soon}
      </button>
    );
  }

  const errorText: Record<CheckoutErrorKind, string> = {
    unavailable: labels.unavailable,
    termsRequired: labels.termsRequired,
    error: labels.error,
  };

  return (
    <>
      <button
        type="button"
        className={`${className} ${activeClassName}`}
        onClick={() => termsAccepted && void start(packageKey)}
        disabled={busy || !termsAccepted}
        aria-busy={busy}
        aria-describedby={describedBy}
      >
        {busy ? labels.loading : labels.buy}
      </button>
      {error ? (
        <p className={errorClassName} role="alert">
          {errorText[error]}
        </p>
      ) : null}
    </>
  );
}
