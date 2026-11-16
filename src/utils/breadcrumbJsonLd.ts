/**
 * BreadcrumbList yapısal verisi (SEO raporu 2026-11-16: tüm şablonlarda). İlk öğe her zaman site kökü.
 * Sonraki öğeler `{ name, url }`; adı boş olan öğe atlanır, konumlar yeniden numaralanır.
 */
import { BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';

export type Crumb = { name: string | null | undefined; url: string };

export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  const items = [{ name: BRAND.name, url: `${siteBaseUrl()}/` }, ...crumbs].filter((c): c is { name: string; url: string } =>
    Boolean(c.name && c.name.trim()),
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name.trim(), item: c.url })),
  };
}
