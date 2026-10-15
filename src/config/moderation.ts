/**
 * Gündem moderasyonu ayarları — sayılar TEK yerde (sunucu, arayüz ve Topluluk Kuralları metni buradan okur).
 * Şikâyet eşiği ortamdan ayarlanabilir; diğerleri sabit (değiştirmek kod değişikliği, testler bunlara bağlı).
 */

/** Şikâyetlere en geç bu kadar saatte bakılır (Topluluk Kuralları, şikâyet onay metni, mağaza notu). */
export const REPORT_REVIEW_HOURS = 24;

/** Bir içeriğe bu kadar FARKLI kullanıcıdan açık şikâyet gelince yönetici karar verene kadar gizlenir. */
export const DEFAULT_REPORT_HIDE_THRESHOLD = 3;

/** `MODERATION_REPORT_THRESHOLD` (2–50) ile değiştirilebilir; geçersizse varsayılan. */
export function reportHideThreshold(): number {
  const n = Number(process.env.MODERATION_REPORT_THRESHOLD);
  return Number.isInteger(n) && n >= 2 && n <= 50 ? n : DEFAULT_REPORT_HIDE_THRESHOLD;
}

/** Şikâyet nedenleri (mobil sözleşmesiyle aynı; docs/WEB_CHANGES_FOR_MOBILE §24). VIOLENCE web'de SEXUAL ile tek seçenek. */
export const REPORT_REASONS = ['HARASSMENT', 'HATE', 'SPAM', 'SEXUAL', 'VIOLENCE', 'MISINFO', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Web şikâyet formunda gösterilen sıra (müstehcen / şiddet tek seçenek: SEXUAL). */
export const REPORT_REASONS_UI: readonly ReportReason[] = ['HARASSMENT', 'HATE', 'SPAM', 'SEXUAL', 'MISINFO', 'OTHER'];
export const REPORT_NOTE_MAX = 500;
/** Kullanıcı başına şikâyet hız sınırı. */
export const REPORT_RATE_LIMIT = 20;
export const REPORT_RATE_WINDOW_MS = 60 * 60_000;

/** Gönderi / yorum başına doğrulanan (bağlantıya dönüşen + bildirim alan) en fazla etiket. */
export const MAX_MENTIONS = 5;

/** Spam: bu kadar günden yeni hesap "yeni hesap" sayılır ve en fazla NEW_ACCOUNT_MAX_LINKS bağlantı paylaşabilir. */
export const NEW_ACCOUNT_DAYS = 7;
export const NEW_ACCOUNT_MAX_LINKS = 1;
/** Eski hesapta bu sayıdan FAZLA bağlantı → yayınlanır ama kuyruğa işaretlenir (ORTA). */
export const LINK_FLAG_ABOVE = 3;
/** Aynı kullanıcı aynı metni bu süre içinde tekrar paylaşamaz (red); 24 saat içinde tekrarı ORTA işaret. */
export const DUPLICATE_BLOCK_WINDOW_MS = 10 * 60_000;
export const DUPLICATE_FLAG_WINDOW_MS = 24 * 60 * 60_000;

/** Yönetici e-posta bildirimi: en fazla bu aralıkta bir özet e-posta (toplu; her şikâyette değil). */
export const ADMIN_ALERT_INTERVAL_MS = 30 * 60_000;

/** Kalıcı askı tarihi (User.gundemSuspendedUntil). */
export const PERMANENT_SUSPENSION = new Date('9999-12-31T00:00:00.000Z');
