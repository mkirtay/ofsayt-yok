/**
 * GET /api/matches/counters?ids=1,2,3 — maçların görüntülenme + yorum sayıları, TEK istekte (liste için).
 * Yanıt: `{ counts: { [matchId]: { views, comments } } }` (ikisi de 0 olan maç yanıtta yok).
 *
 * Yetki: `NEXT_PUBLIC_MATCH_COUNTERS_PUBLIC` kapalıyken (varsayılan) YALNIZ ADMIN; diğer herkese 401/403 ve sayı yok.
 * Açıkken herkese; aynı yanıt herkes için aynı olduğundan CDN'de 60 sn saklanır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { MATCH_COUNTERS_PUBLIC, parseCounterIds, type MatchCountsMap } from '@/config/matchCounters';
import { readMatchCounters } from '@/server/matchCounters';

export type MatchCountersResponse = { counts: MatchCountsMap };

export async function handleMatchCounters(
  req: NextApiRequest,
  res: NextApiResponse,
  isPublic: boolean,
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return void res.status(405).end();
  }
  if (isPublic) {
    const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
    const rl = await hitFixedWindowRateLimit(`match-counters:ip:${ip}`, 60, 60_000);
    if (!rl.success) return void res.status(429).json({ error: 'Çok fazla istek.' });
  } else {
    res.setHeader('Cache-Control', 'private, no-store');
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
  }

  const ids = parseCounterIds(req.query.ids);
  try {
    const counts = ids.length > 0 ? await readMatchCounters(ids) : {};
    res.setHeader('Cache-Control', isPublic ? 'public, s-maxage=60, stale-while-revalidate=120' : 'private, no-store');
    return void res.status(200).json({ counts } satisfies MatchCountersResponse);
  } catch (e) {
    captureError('matches:counters', e);
    res.setHeader('Cache-Control', 'no-store');
    return void res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return handleMatchCounters(req, res, MATCH_COUNTERS_PUBLIC);
}
