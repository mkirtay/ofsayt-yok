import { getRedisClient, withRedis } from '@/lib/redis';
import { fetchAllNews } from '@/services/newsService';
import type { NewsItem } from '@/models/domain';

const CACHE_TTL_MS = 5 * 60 * 1000;
const REDIS_KEY = 'news:cache';
const REDIS_TTL_SEC = 300;

// In-memory snapshot: fallback when Redis is absent or on fetch errors
let memSnapshot: NewsItem[] | null = null;
let memSnapshotTs = 0;

export async function getCachedNews(): Promise<NewsItem[]> {
  const redis = getRedisClient();

  if (redis) {
    const cached = await withRedis((r) => r.get<NewsItem[]>(REDIS_KEY), null);
    if (cached) return cached;
  }
  if (memSnapshot && Date.now() - memSnapshotTs < CACHE_TTL_MS) {
    return memSnapshot;
  }

  const items = await fetchAllNews(50);
  memSnapshot = items;
  memSnapshotTs = Date.now();

  if (redis) await withRedis((r) => r.set(REDIS_KEY, items, { ex: REDIS_TTL_SEC }), null);

  return items;
}

export function getCacheSnapshot(): NewsItem[] | null {
  return memSnapshot;
}
