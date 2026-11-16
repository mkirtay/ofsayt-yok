import type { GetServerSideProps } from 'next';
import { buildSectionXml, SITEMAP_SECTIONS, type SitemapSection } from '@/server/sitemap/sections';

/** Sitemap bölümü: /sitemaps/{ad}.xml (bkz. server/sitemap/sections.ts). CDN'de 1 gün + 1 gün eski kopya. */
export default function SitemapSectionXml() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ params, res }) => {
  const name = String(params?.name ?? '').replace(/\.xml$/, '');
  if (!(SITEMAP_SECTIONS as readonly string[]).includes(name)) return { notFound: true };
  const xml = await buildSectionXml(name as SitemapSection, Date.now());
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};
