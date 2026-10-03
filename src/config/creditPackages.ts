/**
 * Kredi paketleri ve premium planları — TEK KAYNAK (/credits sayfası; ileride ödeme entegrasyonu).
 * Fiyatlar TL, KDV dahil, kuruş cinsinden tam sayı (kayan nokta hatası olmasın). Ödeme entegrasyonu yok: düğmeler
 * "Yakında". Krediler süresiz. 1 kredi = 1 analiz açma (kredi modeli v2, lib/analysisUnlock.ts).
 */
export type CreditPackage = { key: string; credits: number; priceKurus: number; featured?: boolean };

export const CREDIT_PACKAGES: CreditPackage[] = [
  { key: 'starter', credits: 10, priceKurus: 3999 },
  { key: 'popular', credits: 30, priceKurus: 9999, featured: true },
  { key: 'pro', credits: 100, priceKurus: 24999 },
];

export type PremiumPlan = { key: 'monthly' | 'yearly'; months: number; priceKurus: number };

/** Premium: sınırsız analiz açma + reklamsız (+ ileride AI Asistan kotası). Alan: User.premiumUntil. */
export const PREMIUM_PLANS: PremiumPlan[] = [
  { key: 'monthly', months: 1, priceKurus: 9999 },
  { key: 'yearly', months: 12, priceKurus: 79999 },
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
