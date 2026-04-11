import type { NextApiRequest, NextApiResponse } from 'next';
import { getCachedNews } from '@/services/newsCache';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing id' });
    }

    const items = await getCachedNews();
    const item = items.find((n) => n.id === id);

    if (!item) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    res.status(200).json({ success: true, item });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'News fetch failed' });
  }
}
