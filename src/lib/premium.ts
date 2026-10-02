/**
 * Premium ve yönetici ayrımı — TEK KAYNAK (AI analiz kredi muafiyeti, reklam/sponsor gizleme, /credits rozetleri).
 *
 * Premium: ödeme entegrasyonu gelene kadar KİMSE premium değil. Eskiden bakiye en büyük paketin boyutuna ulaşınca
 * (≥ 100) premium sayılıyordu; premium analizden kredi düşülmediği için bakiye eşiğin altına hiç inmiyor, kullanıcı
 * süresiz sınırsız kalıyordu. Ödeme gelince premium kendi alanına (ör. `User.premiumUntil`) bağlanacak; şema
 * değişikliği o işte. Yönetici premium DEĞİL: reklam görür, PREMIUM rozeti almaz.
 *
 * Yönetici (`ADMIN` rolü, yalnız DB'de elle verilir): analiz üretiminde kredi harcamaz.
 * Rol sunucuda DB'den (canlı), istemcide oturumdan okunur.
 */

export type PremiumInput = { role?: string | null; credits?: number | null };

export function isPremiumUser(user: PremiumInput | null | undefined): boolean {
  void user;
  return false;
}

export function isAdminUser(user: PremiumInput | null | undefined): boolean {
  return user?.role === 'ADMIN';
}

/** Analiz üretimi kredisiz mi: yönetici ya da premium. */
export function analysisIsFree(user: PremiumInput | null | undefined): boolean {
  return isAdminUser(user) || isPremiumUser(user);
}
