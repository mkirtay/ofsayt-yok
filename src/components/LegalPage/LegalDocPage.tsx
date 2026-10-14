import Head from 'next/head';
import { useI18n } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import trLegal from '../../../public/locales/tr/legal.json';
import enLegal from '../../../public/locales/en/legal.json';
import { siteBaseUrl } from '@/lib/siteUrl';
import { brandTitle, withBrandText } from '@/config/brand';
import type { LegalDocKey } from '@/config/legalPages';

/** Yasal metinler JSON'dan doğrudan okunur (t() değil) → marka değişkenleri burada doldurulur. */
const LEGAL = { tr: withBrandText(trLegal), en: withBrandText(enLegal) };

/** Yasal sayfa rotası (legal.json'daki belge + canonical). Rotalar ve sırası: config/legalPages.ts. */
export default function LegalDocPage({ docKey, path }: { docKey: LegalDocKey; path: string }) {
  const { locale } = useI18n();
  const data = (locale === 'en' ? LEGAL.en : LEGAL.tr)[docKey];

  return (
    <>
      <Head>
        <title>{brandTitle(data.pageTitle, '—')}</title>
        <meta name="description" content={data.pageDesc} />
        <link rel="canonical" href={`${siteBaseUrl()}${path}`} />
      </Head>
      <LegalPage pageTitle={data.pageTitle} intro={data.intro} sections={data.sections} draftNotice={data.draftNotice} />
    </>
  );
}
