import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/frikik';
import Frikik from '@/components/Frikik';
import { parseShare, shareImagePath, type ShareInfo } from '@/lib/frikik/share';
import { siteBaseUrl } from '@/lib/siteUrl';


/**
 * /frikik — serbest vuruş mini oyunu (Günün frikiği). `?l=<seviye>&s=<puan>` paylaşım bağlantısı:
 * başlık ve paylaşım görseli sonucu gösterir (tarayıcılar JS çalıştırmadığı için sunucuda). Sayfa kişisel veri içermez →
 * CDN'de önbelleklenir.
 */
export const getServerSideProps: GetServerSideProps<{ shared: ShareInfo | null }> = async ({ query, res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return { props: { shared: parseShare(query) } };
};

export default function FrikikPage({ shared }: { shared: ShareInfo | null }) {
  const { t } = useTranslation('frikik');
  const title = shared ? t('sharedLevelTitle', { level: shared.level, score: shared.score }) : t('pageTitle');
  const SITE = siteBaseUrl();
  const image = `${SITE}${shareImagePath(shared)}`;
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
      <Frikik shared={shared} />
    </>
  );
}
