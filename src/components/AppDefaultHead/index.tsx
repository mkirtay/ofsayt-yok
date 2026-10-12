import Head from 'next/head';
import { siteBaseUrl } from '@/lib/siteUrl';
import { BRAND_ICON_SVG, OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { BRAND } from '@/config/brand';

/**
 * Her sayfanın varsayılan `<head>` etiketleri (`_app`). Paylaşım görseli/kartı etiketleri `key`li: sayfa kendi görselini
 * AYNI key'lerle verirse varsayılanın yerine geçer (next/head `property` meta'larını yalnız key ile tekilleştirir; key'siz
 * sayfa etiketi varsayılanın yanına İKİNCİ etiket olarak eklenir ve tarayıcılar/paylaşım botları ilkini alır).
 * Key'ler: `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:card`, `twitter:image`, `twitter:image:alt`.
 */
export default function AppDefaultHead() {
  return (
    <Head>
      <title>{BRAND.name}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="description" content={`${BRAND.name} — ${BRAND.description}`} />
      <meta property="og:site_name" content={BRAND.name} />
      <meta property="og:type" content="website" key="og:type" />
      {/* Varsayılan paylaşım görseli: config/brandImages.ts (marka adı/alan adı: config/brand.ts). */}
      <meta property="og:image" content={`${siteBaseUrl()}${OG_DEFAULT_IMAGE.path}`} key="og:image" />
      <meta property="og:image:width" content={String(OG_DEFAULT_IMAGE.width)} key="og:image:width" />
      <meta property="og:image:height" content={String(OG_DEFAULT_IMAGE.height)} key="og:image:height" />
      <meta property="og:image:alt" content={OG_DEFAULT_IMAGE.alt} key="og:image:alt" />
      <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
      <meta name="twitter:image" content={`${siteBaseUrl()}${OG_DEFAULT_IMAGE.path}`} key="twitter:image" />
      <meta name="twitter:image:alt" content={OG_DEFAULT_IMAGE.alt} key="twitter:image:alt" />
      {/* İkonlar: scripts/generate-brand-images.mjs üretir (kaynak public/brand/*.svg). */}
      <link rel="icon" href={BRAND_ICON_SVG} type="image/svg+xml" />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" href="/brand/favicon-32.png" type="image/png" sizes="32x32" />
      <link rel="icon" href="/brand/favicon-16.png" type="image/png" sizes="16x16" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.webmanifest" />
    </Head>
  );
}
