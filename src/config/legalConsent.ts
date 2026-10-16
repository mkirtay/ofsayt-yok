import { LEGAL_EFFECTIVE_DATE } from '@/config/seller';

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

/**
 * Satın alma onayı (Ön Bilgilendirme Formu + Mesafeli Satış Sözleşmesi + anında ifa / cayma hakkı beyanı). Sürüm =
 * yasal metinlerin yürürlük tarihi (config/seller.ts); checkout isteği bunu `termsVersion` olarak gönderir, sunucu
 * eşleşmeyeni 409 `PURCHASE_TERMS_OUTDATED` ile reddeder ve kayda KENDİ sürümünü yazar (PaymentOrder.termsVersion).
 */
export const PURCHASE_TERMS_VERSION = LEGAL_EFFECTIVE_DATE;
export const PURCHASE_TERMS_REQUIRED_CODE = 'PURCHASE_TERMS_REQUIRED';
export const PURCHASE_TERMS_OUTDATED_CODE = 'PURCHASE_TERMS_OUTDATED';

/** Onay kutusunun bağlantı verdiği satış belgeleri (yeni sekmede açılır). */
export const PRE_INFO_PATH = '/on-bilgilendirme-formu';
export const DISTANCE_SALES_PATH = '/mesafeli-satis-sozlesmesi';
