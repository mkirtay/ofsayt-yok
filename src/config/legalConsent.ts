/**
 * Kayıt onayı (Kullanım Koşulları + Gizlilik Politikası). Sürüm, kullanıcının onayladığı metnin tarihidir; metinler
 * esaslı değişince artırılır → `User.termsVersion` eski olanlar ileride yeniden onaya çağrılabilir.
 */
export const TERMS_CONSENT_VERSION = '2026-10-14';

/** Onay kutusunun bağlantı verdiği sayfalar (kayıt formu yeni sekmede açar). */
export const TERMS_PATH = '/kullanim-sartlari';
export const PRIVACY_PATH = '/gizlilik-politikasi';

/** Sunucu kapısı: yalnız JSON `true` onay sayılır ("true", 1, "on" değil — istemci boolean gönderir). */
export function isTermsAccepted(value: unknown): value is true {
  return value === true;
}
