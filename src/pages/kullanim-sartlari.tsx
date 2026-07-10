import Head from 'next/head';
import { useI18n } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import trLegal from '../../public/locales/tr/legal.json';
import enLegal from '../../public/locales/en/legal.json';

export default function KullanimSartlariPage() {
  const { locale } = useI18n();
  const data = (locale === 'en' ? enLegal : trLegal).terms;
  const canonicalBase = process.env.AUTH_URL ?? 'https://ofsaytyok.app';

  return (
    <>
      <Head>
        <title>{data.pageTitle} — Ofsayt Yok</title>
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
