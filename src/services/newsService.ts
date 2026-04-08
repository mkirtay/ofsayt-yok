import Parser from 'rss-parser';
import { NEWS_SOURCES, type NewsSource } from '@/config/newsSources';
import type { NewsItem } from '@/models/domain';

const parser = new Parser({
  timeout: 8_000,
  headers: { 'User-Agent': 'OfsaytYok/1.0' },
});

function hashId(source: string, url: string): string {
  let h = 0;
  const str = `${source}::${url}`;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function extractImage(item: Record<string, any>): string | undefined {
  if (item.enclosure?.url) return item.enclosure.url;

  const media =
    item['media:content']?.['$']?.url ||
    item['media:thumbnail']?.['$']?.url;
  if (media) return media;

  const match = (item['content:encoded'] || item.content || '')
    .match(/<img[^>]+src=["']([^"']+)["']/);
  return match?.[1] || undefined;
}

async function fetchSource(source: NewsSource): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(source.rssUrl);
    return (feed.items || []).map((item) => ({
      id: hashId(source.id, item.link || item.guid || item.title || ''),
      title: item.title?.trim() || '',
      url: item.link || '',
      source: source.name,
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      summary: stripHtml(item.contentSnippet || item.content)?.slice(0, 280),
      image: extractImage(item),
    }));
  } catch {
    return [];
  }
}

function deduplicateByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export async function fetchAllNews(limit = 20): Promise<NewsItem[]> {
  const activeSources = NEWS_SOURCES.filter((s) => s.active);
  const results = await Promise.allSettled(activeSources.map(fetchSource));

  const allItems = results.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : [],
  );

  const unique = deduplicateByUrl(allItems);
  unique.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return unique.slice(0, limit);
}
