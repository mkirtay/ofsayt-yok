/**
 * GET /api/news — AI haberleri (son 24 saat, en yeni en üstte). Depo bayatsa (son çalışma 15 dk'dan eski) yenileme arka
 * planda başlar; yanıt beklemez. Ana sayfa kartı `?limit=3` ister.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getLatestNews, newsRefreshDue, refreshNews } from '@/server/news/aiNews';
import { runInBackground } from '@/server/backgroundTask';

export const config = { maxDuration: 120 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const items = await getLatestNews();
    if (await newsRefreshDue()) runInBackground(() => refreshNews());
    // Liste hafif: tam metin detayda.
    const list = items.slice(0, limit).map(({ content: _c, keyPoints: _k, sources: _s, ...rest }) => rest);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    res.status(200).json({ success: true, items: list });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: (error instanceof Error && error.message) || 'News fetch failed' });
  }
}
