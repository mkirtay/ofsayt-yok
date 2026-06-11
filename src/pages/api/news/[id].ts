import type { NextApiRequest, NextApiResponse } from 'next';
import { getCachedNews } from '@/services/newsCache';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ip = requestIp(req.headers, req.socket.remoteAddress);
    const rl = await hitFixedWindowRateLimit(`news:${ip}`, 60, 60 * 1000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ success: false, error: 'Too many requests' });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing id' });
    }

    const items = await getCachedNews();
    const item = items.find((n) => n.id === id);

    if (!item) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const withSidebar = req.query.sidebar === '1';
    const payload: Record<string, unknown> = { success: true, item };
    if (withSidebar) {
      payload.sidebarNews = items.filter((n) => n.id !== id).slice(0, 5);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    res.status(200).json(payload);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'News fetch failed' });
  }
}
