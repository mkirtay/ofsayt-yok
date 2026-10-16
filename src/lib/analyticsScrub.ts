/**
 * Vercel Web Analytics `beforeSend`: sayfa adresindeki kişisel / gizli sorgu parametrelerini göndermez.
 * - /odeme/* (Hikie dönüşü; adreste müşteri e-postası ve ödeme bağlantısı belirteci olabilir): tüm sorgu ve hash atılır.
 * - Diğer sayfalar: e-posta / ad / telefon / belirteç benzeri parametreler silinir (ör. /auth/reset-password?token=…).
 * Sayfa betiği adresi zaten temizler (lib/paymentReturnUrl.ts); bu katman ilk sayfa görüntülemesi yarışa karşı yedek.
 */
const PII_PARAMS = new Set([
  'customeremail',
  'email',
  'customername',
  'customerphone',
  'phone',
  'checkoutlinktoken',
  'token',
  'code',
]);

const PAYMENT_PATH_RE = /^\/(?:en\/)?odeme\//;

export function scrubAnalyticsUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.split(/[?#]/)[0] ?? raw;
  }
  if (PAYMENT_PATH_RE.test(u.pathname)) {
    u.search = '';
    u.hash = '';
    return u.toString();
  }
  for (const k of [...u.searchParams.keys()]) if (PII_PARAMS.has(k.toLowerCase())) u.searchParams.delete(k);
  return u.toString();
}

export function scrubAnalyticsEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: scrubAnalyticsUrl(event.url) };
}
