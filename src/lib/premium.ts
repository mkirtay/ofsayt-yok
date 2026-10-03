/**
 * Premium ve yönetici ayrımı — TEK KAYNAK (AI analiz açma muafiyeti, reklam/sponsor gizleme, rozetler).
 *
 * Premium: `User.premiumUntil` gelecekteyse (kredi modeli v2). Yönetici panelinden elle verilir (PremiumGrant denetim
 * izi); ödeme entegrasyonunda aynı alan satın almadan beslenecek. Premium analizleri kredisiz açar, reklam görmez;
 * premium döneminde açılanlar premium bitince de açık kalır (AnalysisUnlock).
 * Yönetici (`ADMIN`, yalnız DB'de elle verilir) premium DEĞİL: reklam görür, PREMIUM rozeti almaz; analizleri kredisiz açar.
 * Sunucuda DB'den (canlı), istemcide oturumdan (JWT, 60 sn tazeleme) okunur.
 */

export type PremiumInput = { role?: string | null; premiumUntil?: Date | string | null };

function toTime(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function isPremiumUser(user: PremiumInput | null | undefined, now: number = Date.now()): boolean {
  const until = toTime(user?.premiumUntil);
  return until != null && until > now;
}

export function isAdminUser(user: PremiumInput | null | undefined): boolean {
  return user?.role === 'ADMIN';
}

/** Analiz açma / üretim kredisiz mi: yönetici ya da premium. */
export function analysisIsFree(user: PremiumInput | null | undefined, now: number = Date.now()): boolean {
  return isAdminUser(user) || isPremiumUser(user, now);
}
