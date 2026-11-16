import type { GetServerSideProps } from 'next';
import { siteBaseUrl } from '@/lib/siteUrl';
import { buildIndexXml } from '@/server/sitemap/sections';

/** Sitemap dizini (2026-11-16'dan beri): bölümler /sitemaps/{sayfalar,maclar,takimlar,kisiler}.xml (bkz. server/sitemap). */
export default function SitemapXml() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  res.write(buildIndexXml(siteBaseUrl(), Date.now()));
  res.end();
  return { props: {} };
};
