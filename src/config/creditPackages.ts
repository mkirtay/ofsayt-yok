/**
 * Kredi paketleri — TEK KAYNAK (/pricing sayfası, ödeme kataloğu config/paymentPackages.ts, yasal sayfalardaki fiyat
 * tablosu ve sipariş e-postası). Premium planları 2026-10-16'da kaldırıldı (yalnız kredi satılır).
 * Fiyatlar TL, KDV dahil, kuruş cinsinden tam sayı (kayan nokta hatası olmasın). Krediler süresiz. 1 kredi = 1 analiz
 * açma (kredi modeli v2, lib/analysisUnlock.ts). `paymentKey`: Hikie Checkout Link'inin env anahtarı (HIKIE_LINK_<KEY>).
 */
export type CreditPackage = { key: string; paymentKey: string; credits: number; priceKurus: number; featured?: boolean };

export const CREDIT_PACKAGES: CreditPackage[] = [
  { key: 'starter', paymentKey: 'credits_10', credits: 10, priceKurus: 3999 },
  { key: 'popular', paymentKey: 'credits_30', credits: 30, priceKurus: 9999, featured: true },
  { key: 'pro', paymentKey: 'credits_100', credits: 100, priceKurus: 24999 },
];

/** "39,99 TL" */
export function formatTry(kurus: number): string {
  return `${(kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

/** Kredi başı fiyat (kuruş, aşağı yuvarlanmaz — gösterim için en yakın kuruş). */
export function perCreditKurus(pkg: CreditPackage): number {
  return Math.round(pkg.priceKurus / pkg.credits);
}
