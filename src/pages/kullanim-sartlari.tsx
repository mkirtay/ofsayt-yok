import Head from 'next/head';
import { useI18n } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import trLegal from '../../public/locales/tr/legal.json';
import enLegal from '../../public/locales/en/legal.json';
import { siteBaseUrl } from '@/lib/siteUrl';
import { brandTitle, withBrandText } from '@/config/brand';

/** Yasal metinler JSON'dan doğrudan okunur (t() değil) → marka değişkenleri burada doldurulur. */
const LEGAL = { tr: withBrandText(trLegal), en: withBrandText(enLegal) };

export default function KullanimSartlariPage() {
  const { locale } = useI18n();
  const data = (locale === 'en' ? LEGAL.en : LEGAL.tr).terms;
  const canonicalBase = siteBaseUrl();

  return (
    <>
      <Head>
        <title>{brandTitle(data.pageTitle, '—')}</title>
        <meta name="description" content={data.pageDesc} />
        <link rel="canonical" href={`${canonicalBase}/kullanim-sartlari`} />
      </Head>
      <LegalPage
        pageTitle={data.pageTitle}
        intro={data.intro}
        sections={data.sections}
        draftNotice={data.draftNotice}
      />
    </>
  );
}
