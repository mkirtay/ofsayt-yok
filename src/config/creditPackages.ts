/**
 * Satın alınabilir kredi paketleri — TEK KAYNAK (/credits sayfası + premium eşiği).
 * Not: paketlerin FİYATI henüz tanımlı değil (ödeme entegrasyonu yok; butonlar "Yakında"). Yalnızca kredi miktarı var.
 */
export type CreditPackage = { key: string; credits: number; featured?: boolean };

export const CREDIT_PACKAGES: CreditPackage[] = [
  { key: 'starter', credits: 5 },
  { key: 'popular', credits: 50, featured: true },
  { key: 'pro', credits: 100 },
];

/**
 * Premium eşiği = en büyük satın alınabilir paketin boyutu ("büyük paket = premium"; ayrı bir fiyatlandırma yok).
 * Paket listesinden türetilir, böylece paketler değişince eşik kendiliğinden güncellenir.
 */
export const PREMIUM_CREDIT_THRESHOLD = Math.max(...CREDIT_PACKAGES.map((p) => p.credits));

/** En büyük paket (premium'a geçiren paket). */
export const PREMIUM_PACKAGE_KEY = CREDIT_PACKAGES.reduce((a, b) => (b.credits > a.credits ? b : a)).key;
