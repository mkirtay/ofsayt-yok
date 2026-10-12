import type { GetServerSideProps } from 'next';
import { BRAND } from '@/config/brand';
import { BRAND_INK, BRAND_PWA_ICONS } from '@/config/brandImages';

/** Web uygulama bildirimi. Ad `config/brand.ts`'ten okunur (statik dosya olsaydı marka değişiminde unutulurdu). */
export function buildWebManifest() {
  return {
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.description,
    lang: 'tr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_INK,
    theme_color: BRAND_INK,
    icons: BRAND_PWA_ICONS,
  };
}

export default function WebManifest() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  // İçerik yalnız dağıtımla değişir → CDN'de 1 gün (+1 gün eski kopya); robots.txt ile aynı.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  res.write(JSON.stringify(buildWebManifest()));
  res.end();
  return { props: {} };
};
