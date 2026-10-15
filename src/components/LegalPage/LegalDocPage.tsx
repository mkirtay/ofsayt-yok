import Head from 'next/head';
import { useI18n } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import trLegal from '../../../public/locales/tr/legal.json';
import enLegal from '../../../public/locales/en/legal.json';
import { siteBaseUrl } from '@/lib/siteUrl';
import { brandTitle, withBrandText } from '@/config/brand';
import { legalPage, type LegalDocKey } from '@/config/legalPages';
import { REPORT_REVIEW_HOURS } from '@/config/moderation';

/** Metindeki sayılar tek kaynaktan (ör. şikâyet inceleme süresi → config/moderation.ts). */
function withLegalVars<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll('{{reviewHours}}', String(REPORT_REVIEW_HOURS)) as T;
  if (Array.isArray(value)) return value.map(withLegalVars) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withLegalVars(v)])) as T;
  }
  return value;
}

/** Yasal metinler JSON'dan doğrudan okunur (t() değil) → marka ve sayı değişkenleri burada doldurulur. */
const LEGAL = { tr: withLegalVars(withBrandText(trLegal)), en: withLegalVars(withBrandText(enLegal)) };

/** Yasal sayfa rotası (legal.json'daki belge + canonical ya da noindex). Rotalar ve sırası: config/legalPages.ts. */
export default function LegalDocPage({ docKey }: { docKey: LegalDocKey }) {
  const { locale } = useI18n();
  const { path, noindex } = legalPage(docKey);
  const data = (locale === 'en' ? LEGAL.en : LEGAL.tr)[docKey];

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
      <LegalPage pageTitle={data.pageTitle} intro={data.intro} sections={data.sections} draftNotice={data.draftNotice} />
    </>
  );
}
