/**
 * Kredi paketleri ve premium planları — TEK KAYNAK (/credits sayfası ve ödeme kataloğu, config/paymentPackages.ts).
 * Fiyatlar TL, KDV dahil, kuruş cinsinden tam sayı (kayan nokta hatası olmasın). Krediler süresiz. 1 kredi = 1 analiz
 * açma (kredi modeli v2, lib/analysisUnlock.ts). `paymentKey`: Hikie Checkout Link'inin env anahtarı (HIKIE_LINK_<KEY>).
 */
export type CreditPackage = { key: string; paymentKey: string; credits: number; priceKurus: number; featured?: boolean };

export const CREDIT_PACKAGES: CreditPackage[] = [
  { key: 'starter', paymentKey: 'credits_10', credits: 10, priceKurus: 3999 },
  { key: 'popular', paymentKey: 'credits_30', credits: 30, priceKurus: 9999, featured: true },
  { key: 'pro', paymentKey: 'credits_100', credits: 100, priceKurus: 24999 },
];

export type PremiumPlan = { key: 'monthly' | 'yearly'; paymentKey: string; months: number; days: number; priceKurus: number };

/**
 * Premium: sınırsız analiz açma + reklamsız (+ ileride AI Asistan kotası). Alan: User.premiumUntil.
 * Satın almada premiumUntil = max(şimdi, mevcut) + `days`.
 */
export const PREMIUM_PLANS: PremiumPlan[] = [
  { key: 'monthly', paymentKey: 'premium_30d', months: 1, days: 30, priceKurus: 9999 },
  { key: 'yearly', paymentKey: 'premium_365d', months: 12, days: 365, priceKurus: 79999 },
];

/** "39,99 TL" */
export function formatTry(kurus: number): string {
  return `${(kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

/** Kredi başı fiyat (kuruş, aşağı yuvarlanmaz — gösterim için en yakın kuruş). */
export function perCreditKurus(pkg: CreditPackage): number {
  return Math.round(pkg.priceKurus / pkg.credits);
}

/** Yıllık planın aylığa göre kaç ay bedava olduğu ("4 ay bedava"). */
export function yearlyFreeMonths(): number {
  const monthly = PREMIUM_PLANS.find((p) => p.key === 'monthly')!;
  const yearly = PREMIUM_PLANS.find((p) => p.key === 'yearly')!;
  // 99,99 × 12 − 799,99 = 399,89 TL ≈ 3,999 ay → "4 ay bedava" (en yakın tam ay).
  return Math.round((monthly.priceKurus * 12 - yearly.priceKurus) / monthly.priceKurus);
}
