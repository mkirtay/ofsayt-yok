/**
 * Yasal sayfalar (footer sırası). Metinler public/locales/{tr,en}/legal.json; hepsi taslak — en üstte "yayın öncesi
 * hukuki inceleme" notu, doldurulacak alanlar köşeli parantezli yer tutucu (legalPages.test.ts listeyi zorlar).
 */
export type LegalDocKey = 'privacy' | 'terms' | 'kvkk' | 'cookies' | 'refund' | 'distanceSales';

/** `noindex`: yer tutucular dolana kadar arama motorlarına kapalı (robots noindex, canonical yok). */
export const LEGAL_PAGES: readonly { docKey: LegalDocKey; path: string; footerKey: string; noindex?: boolean }[] = [
  { docKey: 'privacy', path: '/gizlilik-politikasi', footerKey: 'footer.privacyPolicy' },
  { docKey: 'kvkk', noindex: true, path: '/kvkk-aydinlatma-metni', footerKey: 'footer.kvkk' },
  { docKey: 'cookies', noindex: true, path: '/cerez-politikasi', footerKey: 'footer.cookiePolicy' },
  { docKey: 'terms', path: '/kullanim-sartlari', footerKey: 'footer.termsOfUse' },
  { docKey: 'distanceSales', noindex: true, path: '/mesafeli-satis-sozlesmesi', footerKey: 'footer.distanceSales' },
  { docKey: 'refund', noindex: true, path: '/iade-ve-iptal', footerKey: 'footer.refundPolicy' },
];

export function legalPage(docKey: LegalDocKey) {
  return LEGAL_PAGES.find((p) => p.docKey === docKey)!;
}
