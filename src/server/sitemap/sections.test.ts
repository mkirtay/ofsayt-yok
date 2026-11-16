import { describe, expect, it } from 'vitest';
import { buildIndexXml, buildUrlsetXml, SITEMAP_SECTIONS } from './sections';

describe('sitemap', () => {
  it('dizin bütün bölümleri lastmod ile listeler', () => {
    const xml = buildIndexXml('https://x.com', Date.parse('2026-11-16T10:00:00Z'));
    for (const s of SITEMAP_SECTIONS) expect(xml).toContain(`<loc>https://x.com/sitemaps/${s}.xml</loc>`);
    expect(xml).toContain('<lastmod>2026-11-16</lastmod>');
    expect(xml).toContain('<sitemapindex');
  });

  it('urlset: tekrar eden adres bir kez, lastmod / kaçış', () => {
    const xml = buildUrlsetXml([
      { loc: 'https://x.com/a?b=1&c=2', lastmod: '2026-11-01' },
      { loc: 'https://x.com/a?b=1&c=2', lastmod: '2026-11-02' },
    ]);
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).toContain('<loc>https://x.com/a?b=1&amp;c=2</loc>');
    expect(xml).toContain('<lastmod>2026-11-01</lastmod>');
  });
});
