import { fetchAllNews } from '@/services/newsService';
import type { NewsItem } from '@/models/domain';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { items: NewsItem[]; ts: number } | null = null;

export async function getCachedNews(): Promise<NewsItem[]> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.items;

  const items = await fetchAllNews(50);
  cache = { items, ts: now };
  return items;
}

export function getCacheSnapshot(): NewsItem[] | null {
  if (!cache) return null;
  return cache.items;
}
