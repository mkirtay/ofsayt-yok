import Parser from 'rss-parser';
import { NEWS_SOURCES, type NewsSource } from '@/config/newsSources';
import { isFresh, sortNewestFirst, type NewsCandidate } from '@/server/news/aiNewsCore';
import { BRAND } from '@/config/brand';

const parser = new Parser({
  timeout: 8_000,
  headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${BRAND.compactName}/1.0)` },
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

/** RSS öğesinde okunan (parser tipinde olmayan) uzantı alanları. */
type FeedItemExtras = {
  enclosure?: { url?: string };
  'media:content'?: { $?: { url?: string } };
  'media:thumbnail'?: { $?: { url?: string } };
  'content:encoded'?: string;
  content?: string;
};

function extractImage(item: FeedItemExtras): string | undefined {
  if (item.enclosure?.url) return item.enclosure.url;

  const media =
    item['media:content']?.['$']?.url ||
    item['media:thumbnail']?.['$']?.url;
  if (media) return media;

  const match = (item['content:encoded'] || item.content || '')
    .match(/<img[^>]+src=["']([^"']+)["']/);
  return match?.[1] || undefined;
}

async function fetchSource(source: NewsSource): Promise<NewsCandidate[]> {
  try {
    const feed = await parser.parseURL(source.rssUrl);
    return (feed.items || []).flatMap((item) => {
      const url = item.link || '';
      const title = item.title?.trim() || '';
      const publishedAt = item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : '');
      if (!url || !title || !publishedAt) return [];
      return [{
        id: hashId(source.id, url),
        sourceId: source.id,
        source: source.name,
        title,
        url,
        publishedAt,
        snippet: stripHtml(item.contentSnippet || item.content).slice(0, 400),
        image: extractImage(item),
      }];
    });
  } catch {
    return [];
  }
}

/** Etkin kaynakların son 24 saatlik adayları; URL'ce tekil, en yeni en üstte. */
export async function fetchNewsCandidates(now: number = Date.now()): Promise<NewsCandidate[]> {
  const activeSources = NEWS_SOURCES.filter((s) => s.active);
  const results = await Promise.allSettled(activeSources.map(fetchSource));
  const seen = new Set<string>();
  const fresh = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((c) => isFresh(c.publishedAt, now))
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
  return sortNewestFirst(fresh);
}
