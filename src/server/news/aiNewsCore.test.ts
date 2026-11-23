import { describe, expect, it } from 'vitest';
import type { NewsItem } from '@/models/domain';
import {
  NEWS_MAX_AGE_MS,
  coveredUrls,
  isFresh,
  mergeStore,
  parseStoryPicks,
  parseWrittenArticle,
  sortNewestFirst,
  storyId,
} from './aiNewsCore';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const item = (id: string, msAgo: number, extra: Partial<NewsItem> = {}): NewsItem => ({
  id, title: id, url: `https://x.test/${id}`, source: 'X', publishedAt: iso(msAgo), ...extra,
});

describe('isFresh', () => {
  it('24 saati aşan, geçersiz ve uzak gelecek tarihleri eler', () => {
    expect(isFresh(iso(60_000), NOW)).toBe(true);
    expect(isFresh(iso(NEWS_MAX_AGE_MS - 1), NOW)).toBe(true);
    expect(isFresh(iso(NEWS_MAX_AGE_MS + 1), NOW)).toBe(false);
    expect(isFresh('bozuk', NOW)).toBe(false);
    expect(isFresh(iso(-5 * 60_000), NOW)).toBe(true);
    expect(isFresh(iso(-60 * 60_000), NOW)).toBe(false);
  });
});

describe('sortNewestFirst', () => {
  it('en yeni en üstte', () => {
    expect(sortNewestFirst([item('a', 3000), item('b', 1000), item('c', 2000)]).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('parseStoryPicks', () => {
  it('geçersiz, tekrar eden ve aralık dışı indeksleri atar, üst sınıra uyar', () => {
    const raw = { stories: [{ indexes: [2, 5, 2] }, { indexes: [5, 99] }, { indexes: [1] }, { indexes: [-1, 'x'] }, { indexes: [3] }] };
    expect(parseStoryPicks(raw, 6, 2)).toEqual([{ indexes: [2, 5] }, { indexes: [1] }]);
    expect(parseStoryPicks(null, 6, 3)).toEqual([]);
  });
});

describe('parseWrittenArticle', () => {
  const para = 'Bu paragraf maçın ayrıntılarını, oyuncuların performansını ve sonucun ligdeki etkisini anlatıyor. '.repeat(5);
  const ok = { title: 'Başlık', summary: 'Özet bir. Özet iki.', paragraphs: [para, para, para, para], keyPoints: ['a', 'b', ''] };

  it('etiketli JSON çözülür, boş maddeler atılır', () => {
    const out = parseWrittenArticle(`önsöz <article_json>${JSON.stringify(ok)}</article_json>`);
    expect(out?.title).toBe('Başlık');
    expect(out?.paragraphs).toHaveLength(4);
    expect(out?.keyPoints).toEqual(['a', 'b']);
  });

  it('etiket yoksa ilk JSON nesnesi denenir', () => {
    expect(parseWrittenArticle(`Haber: ${JSON.stringify(ok)}`)?.summary).toBe('Özet bir. Özet iki.');
  });

  it('kısa (hafif) yazıyı ve bozuk JSON’u reddeder', () => {
    expect(parseWrittenArticle(JSON.stringify({ ...ok, paragraphs: ['kısa', 'kısa', 'kısa'] }))).toBeNull();
    expect(parseWrittenArticle(JSON.stringify({ ...ok, paragraphs: [para, para] }))).toBeNull();
    expect(parseWrittenArticle('<article_json>{bozuk</article_json>')).toBeNull();
    expect(parseWrittenArticle('metin yok')).toBeNull();
  });
});

describe('mergeStore / coveredUrls / storyId', () => {
  it('yeni haber öncelikli, 48 saati aşan atılır, en yeni üstte', () => {
    const existing = [item('a', 5 * 3600_000), item('old', 49 * 3600_000), item('b', 2 * 3600_000, { title: 'eski' })];
    const added = [item('b', 2 * 3600_000, { title: 'yeni' }), item('c', 60_000)];
    const out = mergeStore(existing, added, NOW);
    expect(out.map((n) => n.id)).toEqual(['c', 'b', 'a']);
    expect(out[1].title).toBe('yeni');
  });

  it('kapsanan URL’ler birincil + kaynak URL’leri', () => {
    const urls = coveredUrls([item('a', 0, { sources: [{ name: 'Y', url: 'https://y.test/1' }] })]);
    expect([...urls].sort()).toEqual(['https://x.test/a', 'https://y.test/1']);
  });

  it('storyId kararlı', () => {
    expect(storyId('https://x.test/1')).toBe(storyId('https://x.test/1'));
    expect(storyId('https://x.test/1')).not.toBe(storyId('https://x.test/2'));
    expect(storyId('https://x.test/1')).toMatch(/^h[0-9a-z]+$/);
  });
});
