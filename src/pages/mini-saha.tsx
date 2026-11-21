import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/miniSaha';
import MiniSaha from '@/components/MiniSaha';
import { siteBaseUrl } from '@/lib/siteUrl';
import JsonLd from '@/components/JsonLd';
import { webGameJsonLd } from '@/utils/listJsonLd';

/** /mini-saha — bota karşı mini futbol. Kişisel veri yok → statik sayfa; ilerleme istemcide / API'de. */
export const getStaticProps: GetStaticProps = async () => ({ props: {} });

export default function MiniSahaPage() {
  const { t } = useTranslation('miniSaha');
  const SITE = siteBaseUrl();
  const url = `${SITE}/mini-saha`;
  return (
    <>
      <Head>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={t('pageTitle')} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={url} />
        <JsonLd schema={webGameJsonLd({ name: t('title'), description: t('pageDesc'), url })} />
      </Head>
      <MiniSaha />
    </>
  );
}
