import { getRedisClient } from '@/lib/redis';
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
    try {
      const cached = await redis.get<NewsItem[]>(REDIS_KEY);
      if (cached) return cached;
    } catch {
      // Redis okuma hatası → fetch'e geç
    }
  } else if (memSnapshot && Date.now() - memSnapshotTs < CACHE_TTL_MS) {
    return memSnapshot;
  }

  const items = await fetchAllNews(50);
  memSnapshot = items;
  memSnapshotTs = Date.now();

  if (redis) {
    try {
      await redis.set(REDIS_KEY, items, { ex: REDIS_TTL_SEC });
    } catch {
      // Redis yazma hatası kritik değil; in-memory snapshot geçerli
    }
  }

  return items;
}

export function getCacheSnapshot(): NewsItem[] | null {
  return memSnapshot;
}
