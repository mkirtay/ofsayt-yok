import Head from 'next/head';
import { useI18n } from '@/lib/i18n';
import LegalPage, { type LegalSection, type LegalTable } from '@/components/LegalPage';
import trLegal from '../../../public/locales/tr/legal.json';
import enLegal from '../../../public/locales/en/legal.json';
import { siteBaseUrl } from '@/lib/siteUrl';
import { brandTitle, withBrandText } from '@/config/brand';
import { legalPage, type LegalDocKey } from '@/config/legalPages';
import { REPORT_REVIEW_HOURS } from '@/config/moderation';
import { sellerHasPlaceholders, sellerText } from '@/config/seller';
import { CREDIT_PACKAGES, formatTry, perCreditKurus } from '@/config/creditPackages';
import { dataProcessorTable } from '@/config/dataProcessors';

/** Hesap silme sayfası (components/AccountDeletion/content.ts ile aynı yol; o modül JSON taşıdığı için burada sabit). */
const ACCOUNT_DELETION_PATH = '/hesap-silme';

/** Metindeki sayılar ve satıcı bilgisi tek kaynaktan (config/moderation.ts, config/seller.ts). */
function withLegalVars<T>(value: T): T {
  if (typeof value === 'string') return sellerText(value.replaceAll('{{reviewHours}}', String(REPORT_REVIEW_HOURS))) as T;
  if (Array.isArray(value)) return value.map(withLegalVars) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withLegalVars(v)])) as T;
  }
  return value;
}

/** Fiyat tablosu: config/creditPackages.ts'ten (KDV dahil) — /credits ve ödeme kataloğuyla aynı kaynak. */
export function creditPackageTable(locale: 'tr' | 'en'): LegalTable {
  const en = locale === 'en';
  return {
    head: en ? ['Package', 'Credits', 'Price (VAT incl.)', 'Per credit'] : ['Paket', 'Kredi', 'Fiyat (KDV dahil)', 'Kredi başı'],
    rows: CREDIT_PACKAGES.map((p) => [
      en ? `${p.credits} credits` : `${p.credits} kredi`,
      String(p.credits),
      formatTry(p.priceKurus),
      formatTry(perCreditKurus(p)),
    ]),
  };
}

type RawSection = { heading: string; body: string; review?: boolean; table?: string };
type RawDoc = { pageTitle: string; pageDesc: string; intro: string; draftNotice: string; effectiveDate?: string; sections: RawSection[] };

/** JSON'daki `"table": "<ad>"` → koddan üretilen tablo. */
const TABLES: Record<string, (locale: 'tr' | 'en') => LegalTable> = {
  creditPackages: creditPackageTable,
  dataProcessors: dataProcessorTable,
};

/** Metninde satıcı bilgisi geçen belge (yer tutucu kaldıkça noindex). */
const usesSeller = (doc: RawDoc) => JSON.stringify(doc).includes('{{seller.');

/** Yasal metinler JSON'dan doğrudan okunur (t() değil) → marka, sayı ve satıcı değişkenleri burada doldurulur. */
const LEGAL = { tr: withLegalVars(withBrandText(trLegal)), en: withLegalVars(withBrandText(enLegal)) };

/** Belge noindex mi: sabit taslak sayfa ya da satıcı yer tutucusu taşıyan sayfa. */
export function legalDocNoindex(docKey: LegalDocKey): boolean {
  const raw = trLegal[docKey] as RawDoc;
  return Boolean(legalPage(docKey).noindex) || (usesSeller(raw) && sellerHasPlaceholders());
}

/** Yasal sayfa rotası (legal.json'daki belge + canonical ya da noindex). Rotalar ve sırası: config/legalPages.ts. */
export default function LegalDocPage({ docKey }: { docKey: LegalDocKey }) {
  const { locale } = useI18n();
  const { path } = legalPage(docKey);
  const lang = locale === 'en' ? 'en' : 'tr';
  const data = (lang === 'en' ? LEGAL.en : LEGAL.tr)[docKey] as RawDoc;
  const noindex = legalDocNoindex(docKey);
  const sections: LegalSection[] = data.sections.map((s) => ({
    ...s,
    table: s.table ? TABLES[s.table]?.(lang) : undefined,
  }));

  return (
    <>
      <Head>
        <title>{brandTitle(data.pageTitle, '—')}</title>
        <meta name="description" content={data.pageDesc} />
        {noindex ? (
          <meta name="robots" content="noindex, follow" />
        ) : (
          <link rel="canonical" href={`${siteBaseUrl()}${path}`} />
        )}
      </Head>
      <LegalPage
        pageTitle={data.pageTitle}
        intro={data.intro}
        sections={sections}
        draftNotice={data.draftNotice}
        effectiveDate={data.effectiveDate}
        related={docKey === 'privacy' ? [{ href: ACCOUNT_DELETION_PATH, label: locale === 'en' ? 'Delete your account →' : 'Hesap silme →' }] : undefined}
      />
    </>
  );
}
