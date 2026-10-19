/**
 * Yasal sayfalar (footer sırası). Metinler public/locales/{tr,en}/legal.json; yer tutucu ve taslak notu yok
 * (legalPages.test.tsx zorlar). Satıcı bilgisi `{{seller.*}}` değişkenleriyle config/seller.ts'ten gelir.
 */
export type LegalDocKey = 'privacy' | 'terms' | 'community' | 'kvkk' | 'cookies' | 'refund' | 'distanceSales' | 'preInfo';

/**
 * `noindex`: arama motorlarına kapalı (robots noindex, canonical yok).
 */
export const LEGAL_PAGES: readonly { docKey: LegalDocKey; path: string; footerKey: string; noindex?: boolean }[] = [
  { docKey: 'privacy', path: '/gizlilik-politikasi', footerKey: 'footer.privacyPolicy' },
  { docKey: 'kvkk', noindex: true, path: '/kvkk-aydinlatma-metni', footerKey: 'footer.kvkk' },
  { docKey: 'cookies', noindex: true, path: '/cerez-politikasi', footerKey: 'footer.cookiePolicy' },
  { docKey: 'terms', path: '/kullanim-sartlari', footerKey: 'footer.termsOfUse' },
  { docKey: 'community', noindex: true, path: '/topluluk-kurallari', footerKey: 'footer.communityRules' },
  { docKey: 'preInfo', noindex: true, path: '/on-bilgilendirme-formu', footerKey: 'footer.preInfo' },
  { docKey: 'distanceSales', noindex: true, path: '/mesafeli-satis-sozlesmesi', footerKey: 'footer.distanceSales' },
  { docKey: 'refund', noindex: true, path: '/iade-ve-iptal', footerKey: 'footer.refundPolicy' },
];

export function legalPage(docKey: LegalDocKey) {
  return LEGAL_PAGES.find((p) => p.docKey === docKey)!;
}
