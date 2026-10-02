/**
 * Satın alınabilir kredi paketleri — TEK KAYNAK (/credits sayfası).
 * Not: paketlerin FİYATI henüz tanımlı değil (ödeme entegrasyonu yok; butonlar "Yakında"). Yalnızca kredi miktarı var.
 */
export type CreditPackage = { key: string; credits: number; featured?: boolean };

export const CREDIT_PACKAGES: CreditPackage[] = [
  { key: 'starter', credits: 5 },
  { key: 'popular', credits: 50, featured: true },
  { key: 'pro', credits: 100 },
];

/**
 * En büyük paket — /credits'te premium notuyla gösterilir. Premium artık bakiyeye bağlı değil (bkz. lib/premium.ts);
 * ödeme entegrasyonunda bu paketin satın alınması premium alanını açacak.
 */
export const PREMIUM_PACKAGE_KEY = CREDIT_PACKAGES.reduce((a, b) => (b.credits > a.credits ? b : a)).key;
