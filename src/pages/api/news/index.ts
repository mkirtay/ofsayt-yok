import type { NextApiRequest, NextApiResponse } from 'next';
import { getCachedNews, getCacheSnapshot } from '@/services/newsCache';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const items = await getCachedNews();
    res.status(200).json({ success: true, items: items.slice(0, limit) });
  } catch (error: any) {
    const stale = getCacheSnapshot();
    if (stale) {
      return res.status(200).json({ success: true, items: stale, stale: true });
    }
    res.status(500).json({ success: false, error: error?.message || 'News fetch failed' });
  }
}
