import { describe, expect, it } from 'vitest';
import { ruleArticleSchemas } from '@/components/RulesArticle';
import { brandTitle } from '@/config/brand';
import { buildLlmsTxt } from '@/pages/llms.txt';
import { parseInline, plainRuleText, RULE_ARTICLES, RULES_HUB, ruleArticlePath } from './futbolKurallari';

const ALL = [RULES_HUB, ...RULE_ARTICLES];

describe('futbol kuralları içeriği', () => {
  it('hub 17 kuralı sırayla içerir', () => {
    expect(RULES_HUB.sections.map((s) => s.heading.match(/^Kural (\d+)/)?.[1])).toEqual(Array.from({ length: 17 }, (_, i) => String(i + 1)));
  });

  it('slug, bölüm kimlikleri benzersiz; başlık ve açıklama SEO sınırlarında', () => {
    expect(new Set(RULE_ARTICLES.map((a) => a.slug)).size).toBe(RULE_ARTICLES.length);
    for (const a of ALL) {
      expect(new Set(a.sections.map((s) => s.id)).size).toBe(a.sections.length);
      expect(brandTitle(a.title).length).toBeLessThanOrEqual(70);
      expect(a.description.length).toBeLessThanOrEqual(160);
      expect(a.faq.length).toBeGreaterThan(0);
    }
  });

  it('satır içi bağlantılar yalnız var olan site içi sayfalara gider', () => {
    const known = new Set([...ALL.map(ruleArticlePath), '/hakemler']);
    const texts = ALL.flatMap((a) => [
      a.lead,
      ...a.faq.map((f) => f.a),
      ...a.sections.flatMap((s) =>
        s.blocks.flatMap((b) => (b.type === 'p' ? [b.text] : b.type === 'ul' || b.type === 'ol' ? b.items : b.type === 'table' ? b.rows.flat() : [])),
      ),
    ]);
    const links = texts.flatMap((t) => parseInline(t).flatMap((p) => (p.kind === 'link' ? [p.href] : [])));
    expect(links.length).toBeGreaterThan(5);
    for (const href of links) expect(known.has(href), href).toBe(true);
  });

  it('parseInline: kalın, bağlantı, dış bağlantı düz metin kalır', () => {
    expect(parseInline('a **b** [c](/d) [e](https://x.com)')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'c', href: '/d' },
      { kind: 'text', text: ' [e](https://x.com)' },
    ]);
    expect(plainRuleText('**Ofsayt** [VAR](/futbol-kurallari/var)')).toBe('Ofsayt VAR');
  });

  it('şemalar: Article + Breadcrumb + FAQPage, FAQ metninde işaret yok', () => {
    const [article, crumbs, faq] = ruleArticleSchemas(RULE_ARTICLES.find((a) => a.slug === 'ofsayt')!) as Record<string, unknown>[];
    expect(article!['@type']).toBe('Article');
    expect(article!.dateModified).toBe('2026-11-16');
    expect((crumbs!.itemListElement as unknown[]).length).toBe(3);
    expect(faq!['@type']).toBe('FAQPage');
    expect(JSON.stringify(faq)).not.toMatch(/\*\*|\]\(/);
  });

  it('llms.txt kural sayfalarını listeler', () => {
    const txt = buildLlmsTxt('https://x.com');
    for (const a of ALL) expect(txt).toContain(`https://x.com${ruleArticlePath(a)}`);
  });
});
