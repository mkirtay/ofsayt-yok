/**
 * "Premium" kullanıcı tespiti — TEK KAYNAK (AI analiz kredi bypass'ı, reklam/sponsor gizleme, /credits rozeti).
 *
 * Model: "büyük kredi paketi = premium". Kullanıcı canlı bakiyesi en büyük satın alınabilir paketin boyutuna
 * (`PREMIUM_CREDIT_THRESHOLD`) ulaştıysa premium sayılır. `ADMIN` rolü test amaçlı her zaman premium.
 * Bakiye `User.credits` alanından okunur: sunucuda DB'den (canlı), istemcide oturum/`useCredits` değerinden.
 */
import { PREMIUM_CREDIT_THRESHOLD } from '@/config/creditPackages';

export type PremiumInput = { role?: string | null; credits?: number | null };

export function isPremiumUser(user: PremiumInput | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return typeof user.credits === 'number' && user.credits >= PREMIUM_CREDIT_THRESHOLD;
}
