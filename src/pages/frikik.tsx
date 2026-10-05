import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/frikik';
import Frikik from '@/components/Frikik';
import { parseShareScore, shareImagePath } from '@/lib/frikik/share';

const SITE = process.env.AUTH_URL ?? 'https://ofsaytyok.app';

/**
 * /frikik — serbest vuruş mini oyunu. `?s=<skor>` paylaşım bağlantısı: başlık ve paylaşım görseli skoru gösterir
 * (tarayıcılar JS çalıştırmadığı için sunucuda). Sayfa kişisel veri içermez → CDN'de önbelleklenir.
 */
export const getServerSideProps: GetServerSideProps<{ sharedScore: number | null }> = async ({ query, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return { props: { sharedScore: parseShareScore(query.s) } };
};

export default function FrikikPage({ sharedScore }: { sharedScore: number | null }) {
  const { t } = useTranslation('frikik');
  const title = sharedScore != null ? t('sharedTitle', { score: sharedScore }) : t('pageTitle');
  const image = `${SITE}${shareImagePath(sharedScore)}`;
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={t('pageDesc')} />
        <link rel="canonical" href={`${SITE}/frikik`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={t('pageDesc')} />
        <meta property="og:url" content={`${SITE}/frikik`} />
        <meta property="og:image" content={image} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={image} />
      </Head>
      <Frikik sharedScore={sharedScore} />
    </>
  );
}
