import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchAllNews } from '@/services/newsService';
import type { NewsItem } from '@/models/domain';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { items: NewsItem[]; ts: number } | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const now = Date.now();

    if (cache && now - cache.ts < CACHE_TTL_MS) {
      return res.status(200).json({ success: true, items: cache.items.slice(0, limit) });
    }

    const items = await fetchAllNews(50);
    cache = { items, ts: now };

    res.status(200).json({ success: true, items: items.slice(0, limit) });
  } catch (error: any) {
    if (cache) {
      return res.status(200).json({ success: true, items: cache.items, stale: true });
    }
    res.status(500).json({ success: false, error: error?.message || 'News fetch failed' });
  }
}
