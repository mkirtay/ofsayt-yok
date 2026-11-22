/**
 * Davet kodu istemci tarafı (büyüme raporu 2.3): /davet/{kod} sunucuda `scor3_ref` çerezini yazar (30 gün). Şifreli
 * kayıt kodu kayıt isteğine ekler; Google ile kayıtta `ReferralCapture` yeni hesaba bir kez bağlar.
 */
export const REFERRAL_COOKIE = 'scor3_ref';

export function readReferralCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)scor3_ref=([A-Z2-9]{8})(?:;|$)/);
  return m ? m[1]! : null;
}

export function clearReferralCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${REFERRAL_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
