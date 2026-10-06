/**
 * Hikie ödeme kataloğu — /credits'teki paket ve planlardan türetilir (fiyatlar tek kaynakta) + yönetici test paketi.
 * Her paketin Hikie panelinde ayrı Checkout Link'i var: HIKIE_LINK_<KEY> (KEY büyük harf, ör. HIKIE_LINK_CREDITS_10).
 * Checkout Link imza üretmez; imza yalnız webhook aboneliğinin tek secret'ıyla (HIKIE_WEBHOOK_SECRET, whsec_) doğrulanır.
 * Paket yalnız HIKIE_LINK_<KEY> VE HIKIE_WEBHOOK_SECRET tanımlıysa satışa açıktır (webhook olmadan kredi verilemez).
 * Link ve secret yalnız sunucuda okunur; istemciye yalnız "satışta mı" bilgisi gider.
 */
import { CREDIT_PACKAGES, PREMIUM_PLANS } from '@/config/creditPackages';

export type PaymentPackage =
  | { key: string; kind: 'credits'; credits: number; priceKurus: number; adminOnly?: boolean }
  | { key: string; kind: 'premium'; days: number; priceKurus: number; adminOnly?: boolean };

/** Yalnız ADMIN görür / satın alır: canlı ödeme akışını 1 TL ile uçtan uca denemek için (1 kredi verir). */
export const TEST_PACKAGE_KEY = 'test_1tl';

export const PAYMENT_PACKAGES: readonly PaymentPackage[] = [
  ...CREDIT_PACKAGES.map((p): PaymentPackage => ({ key: p.paymentKey, kind: 'credits', credits: p.credits, priceKurus: p.priceKurus })),
  ...PREMIUM_PLANS.map((p): PaymentPackage => ({ key: p.paymentKey, kind: 'premium', days: p.days, priceKurus: p.priceKurus })),
  { key: TEST_PACKAGE_KEY, kind: 'credits', credits: 1, priceKurus: 100, adminOnly: true },
];

export function findPaymentPackage(key: unknown): PaymentPackage | null {
  return typeof key === 'string' ? (PAYMENT_PACKAGES.find((p) => p.key === key) ?? null) : null;
}

type Env = Record<string, string | undefined>;

const envName = (key: string) => `HIKIE_LINK_${key.toUpperCase()}`;

/** Paketin Checkout Link'i (yalnız https; değilse yok sayılır). */
export function packageLink(key: string, env: Env = process.env): string | null {
  const v = env[envName(key)]?.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

/** Webhook imza secret'ı (whsec_; tek, abonelikten gelir; yalnız sunucuda, loglanmaz). */
export function webhookSecret(env: Env = process.env): string | null {
  return env.HIKIE_WEBHOOK_SECRET?.trim() || null;
}

/** Satışta olan paketler: HIKIE_LINK_<KEY> + HIKIE_WEBHOOK_SECRET tanımlı. */
export function availablePackageKeys(env: Env = process.env): string[] {
  return webhookSecret(env) ? PAYMENT_PACKAGES.filter((p) => packageLink(p.key, env)).map((p) => p.key) : [];
}

/** Checkout URL'si: linke `merchantOrderId` eklenir (mevcut sorgu korunur). */
export function checkoutUrl(link: string, merchantOrderId: string): string {
  const u = new URL(link);
  u.searchParams.set('merchantOrderId', merchantOrderId);
  return u.toString();
}

/** "39.99" — PaymentOrder.amountTRY (Decimal) için. */
export function kurusToTryString(kurus: number): string {
  return (kurus / 100).toFixed(2);
}
