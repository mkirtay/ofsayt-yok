/**
 * Yasal sayfalar (footer sırası). Metinler public/locales/{tr,en}/legal.json; hepsi taslak — en üstte "yayın öncesi
 * hukuki inceleme" notu, doldurulacak alanlar köşeli parantezli yer tutucu (legalPages.test.ts listeyi zorlar).
 */
export type LegalDocKey = 'privacy' | 'terms' | 'kvkk' | 'cookies' | 'refund' | 'distanceSales';

export const LEGAL_PAGES: readonly { docKey: LegalDocKey; path: string; footerKey: string }[] = [
  { docKey: 'privacy', path: '/gizlilik-politikasi', footerKey: 'footer.privacyPolicy' },
  { docKey: 'kvkk', path: '/kvkk-aydinlatma-metni', footerKey: 'footer.kvkk' },
  { docKey: 'cookies', path: '/cerez-politikasi', footerKey: 'footer.cookiePolicy' },
  { docKey: 'terms', path: '/kullanim-sartlari', footerKey: 'footer.termsOfUse' },
  { docKey: 'distanceSales', path: '/mesafeli-satis-sozlesmesi', footerKey: 'footer.distanceSales' },
  { docKey: 'refund', path: '/iade-ve-iptal', footerKey: 'footer.refundPolicy' },
];

export function legalPagePath(docKey: LegalDocKey): string {
  return LEGAL_PAGES.find((p) => p.docKey === docKey)!.path;
}
