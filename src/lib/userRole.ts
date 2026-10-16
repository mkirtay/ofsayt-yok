/**
 * Yönetici ayrımı — TEK KAYNAK (AI analiz açma / üretim muafiyeti, asistan kotası, rozetler).
 *
 * Premium sistemi kaldırıldı (2026-10-16): `User.premiumUntil` artık HİÇBİR ayrıcalık vermez (kredisiz analiz, reklam
 * gizleme, asistan kotası yok); sütun ve `PremiumGrant` tablosu DB'de duruyor ama koddan okunmuyor. Kredi bakiyesi de
 * muafiyet vermez: 100 kredilik paketi alan kullanıcı her açmada kredi harcar.
 * Yönetici (`ADMIN`, yalnız DB'de elle verilir) analizleri kredisiz açar / üretir.
 */

export type RoleInput = { role?: string | null };

export function isAdminUser(user: RoleInput | null | undefined): boolean {
  return user?.role === 'ADMIN';
}

/** Analiz açma / üretim kredisiz mi: YALNIZ yönetici. */
export function analysisIsFree(user: RoleInput | null | undefined): boolean {
  return isAdminUser(user);
}
