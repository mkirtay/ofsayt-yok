import type { NextApiRequest, NextApiResponse } from 'next';
import {
  loadComparePageData,
  parseCompareSlug,
  type ComparePagePayload,
} from '@/server/loadComparePageData';
import { propsJsonSafe } from '@/server/propsJsonSafe';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ComparePagePayload | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slugParam = req.query.slug;
  const slug =
    typeof slugParam === 'string'
      ? slugParam
      : Array.isArray(slugParam)
        ? slugParam[0] ?? ''
        : '';

  const ids = parseCompareSlug(slug);
  if (!ids) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const data = await loadComparePageData(ids.team1Id, ids.team2Id);
    if (!data) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(propsJsonSafe(data));
  } catch (e) {
    console.error('GET /api/compare/[slug]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
