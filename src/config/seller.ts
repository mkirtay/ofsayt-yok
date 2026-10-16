/**
 * Satıcı / veri sorumlusu kimliği ve yasal metin sürümü — TEK KAYNAK. Yasal sayfalar (`{{seller.*}}` değişkenleri,
 * components/LegalPage/LegalDocPage.tsx), sipariş onay e-postası (server/payments/orderConfirmationEmail.ts) ve satın
 * alma onayı sürümü buradan okur.
 *
 * Değerler henüz belli değil: köşeli parantezli yer tutucular gerçek bilgiyle değiştirilene kadar kalır (kod uydurmaz).
 * Yer tutucu kaldığı sürece satıcı bilgisi geçen yasal sayfalar `noindex` ve en üstte "taslak, avukat onayı bekliyor"
 * notuyla yayınlanır (`sellerHasPlaceholders`). Liste ve avukata sorulacaklar: docs/YASAL_NOTLAR.md.
 */

export type SellerInfo = {
  /** Ticari unvan ya da şahıs işletmesi adı. */
  legalName: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  /** MERSİS numarası (şirketse). */
  mersis: string;
  phone: string;
  email: string;
  /** KEP adresi (varsa). */
  kep: string;
};

export const SELLER: Readonly<SellerInfo> = {
  legalName: '[ŞİRKET/KİŞİ ÜNVANI]',
  address: '[ADRES]',
  taxOffice: '[VERGİ DAİRESİ]',
  taxNumber: '[VERGİ NO]',
  mersis: '[MERSİS NO]',
  phone: '[TELEFON]',
  email: '[İLETİŞİM E-POSTASI]',
  kep: '[KEP ADRESİ]',
};

/** Satıcı alanlarında izin verilen yer tutucular (yasal metin testi bunların dışında köşeli parantez kabul etmez). */
export const SELLER_PLACEHOLDERS = [
  '[ŞİRKET/KİŞİ ÜNVANI]',
  '[ADRES]',
  '[VERGİ DAİRESİ]',
  '[VERGİ NO]',
  '[MERSİS NO]',
  '[TELEFON]',
  '[İLETİŞİM E-POSTASI]',
  '[KEP ADRESİ]',
] as const;

const PLACEHOLDER_RE = /\[[^\]]+\]/;

/** Herhangi bir satıcı alanı hâlâ yer tutucu mu (o zaman ilgili sayfalar noindex + taslak notu). */
export function sellerHasPlaceholders(seller: Readonly<SellerInfo> = SELLER): boolean {
  return Object.values(seller).some((v) => PLACEHOLDER_RE.test(v));
}

/**
 * Yasal metinlerin (Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, İade ve İptal, Gizlilik / KVKK) yürürlük tarihi
 * (ISO gün). Bu metinlerde esaslı değişiklik yapınca güncellenir; satın alma onayının sürümü de budur
 * (`PaymentOrder.termsVersion`, config/legalConsent.ts `PURCHASE_TERMS_VERSION`).
 */
export const LEGAL_EFFECTIVE_DATE = '2026-10-16';

/** Metin değişkenleri: `{{seller.legalName}}` … ve `{{legalEffectiveDate}}`. */
export const SELLER_TEXT_VARS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(SELLER).map(([k, v]) => [`seller.${k}`, v])),
  legalEffectiveDate: LEGAL_EFFECTIVE_DATE,
};

/** Metindeki `{{seller.*}}` / `{{legalEffectiveDate}}` değişkenlerini doldurur; diğerlerine dokunmaz. */
export function sellerText(text: string): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (m, k: string) => SELLER_TEXT_VARS[k] ?? m);
}

/** Satıcı kimlik satırı (yasal sayfalar ve e-posta): "Unvan: … · Adres: … · …". */
export function sellerLine(locale: 'tr' | 'en', seller: Readonly<SellerInfo> = SELLER): string {
  const L =
    locale === 'en'
      ? ['Name', 'Address', 'Tax office / no', 'MERSİS', 'Phone', 'E-mail', 'KEP (registered e-mail)']
      : ['Unvan', 'Adres', 'Vergi dairesi / no', 'MERSİS', 'Telefon', 'E-posta', 'KEP'];
  return [
    `${L[0]}: ${seller.legalName}`,
    `${L[1]}: ${seller.address}`,
    `${L[2]}: ${seller.taxOffice} / ${seller.taxNumber}`,
    `${L[3]}: ${seller.mersis}`,
    `${L[4]}: ${seller.phone}`,
    `${L[5]}: ${seller.email}`,
    `${L[6]}: ${seller.kep}`,
  ].join(' · ');
}
