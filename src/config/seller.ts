/**
 * Satıcı / veri sorumlusu kimliği ve yasal metin sürümü — TEK KAYNAK. Yasal sayfalar (`{{seller.*}}` değişkenleri,
 * components/LegalPage/LegalDocPage.tsx), sipariş onay e-postası (server/payments/orderConfirmationEmail.ts) ve satın
 * alma onayı sürümü buradan okur.
 *
 * Satış, ticari unvan / adres / vergi bilgisi olmadan marka adı, alan adı ve resmi e-postayla açıldı (kullanıcı kararı,
 * 2026-10-19). Bu bilgiler belli olunca alan olarak eklenir; metinlerde yer tutucu kullanılmaz. Bkz. docs/YASAL_NOTLAR.md.
 */
import { BRAND } from '@/config/brand';

export type SellerInfo = {
  /** Satıcının adı (şimdilik marka adı). */
  name: string;
  /** Satış yapılan web sitesi (alan adı). */
  website: string;
  email: string;
};

export const SELLER: Readonly<SellerInfo> = {
  name: BRAND.name,
  website: BRAND.domain,
  email: BRAND.contactEmail,
};

/**
 * Yasal metinlerin (Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, İade ve İptal, Gizlilik / KVKK) yürürlük tarihi
 * (ISO gün). Bu metinlerde esaslı değişiklik yapınca güncellenir; satın alma onayının sürümü de budur
 * (`PaymentOrder.termsVersion`, config/legalConsent.ts `PURCHASE_TERMS_VERSION`).
 */
export const LEGAL_EFFECTIVE_DATE = '2026-10-19';

/** Metin değişkenleri: `{{seller.name}}`, `{{seller.website}}`, `{{seller.email}}` ve `{{legalEffectiveDate}}`. */
export const SELLER_TEXT_VARS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(SELLER).map(([k, v]) => [`seller.${k}`, v])),
  legalEffectiveDate: LEGAL_EFFECTIVE_DATE,
};

/** Metindeki `{{seller.*}}` / `{{legalEffectiveDate}}` değişkenlerini doldurur; diğerlerine dokunmaz. */
export function sellerText(text: string): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (m, k: string) => SELLER_TEXT_VARS[k] ?? m);
}

/** Satıcı kimlik satırı (yasal sayfalar ve e-posta): "Satıcı: … · Web sitesi: … · E-posta: …". */
export function sellerLine(locale: 'tr' | 'en', seller: Readonly<SellerInfo> = SELLER): string {
  const L = locale === 'en' ? ['Seller', 'Website', 'E-mail'] : ['Satıcı', 'Web sitesi', 'E-posta'];
  return [`${L[0]}: ${seller.name}`, `${L[1]}: ${seller.website}`, `${L[2]}: ${seller.email}`].join(' · ');
}
