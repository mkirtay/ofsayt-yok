/**
 * GET /api/matches/[id]/momentum — Genel Bakış momentum (baskı) grafiği: `{ points, segments, live }` (~100 tam sayı).
 * Kaynak ve maliyet: bkz. server/matchMomentum.ts (maç başına tek önbellekli `fixtures/{id}`). CDN süresi önbellek
 * kaydından (`sportmonksCacheControl`): canlı ≤ 15 + 5 sn, eski bitmiş maç günlerce. 204 = veri yok (bileşen görünmez).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadMatchMomentum } from '@/server/matchMomentum';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^\d{1,12}$/.test(id) || !isSportmonksProviderEnabled()) {
    return res.status(400).json({ error: 'Geçersiz maç' });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`match-momentum:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const r = await loadMatchMomentum(id);
    if (r.kind === 'unavailable') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Momentum verisi şu an alınamıyor.' });
    }
    res.setHeader('Cache-Control', r.cacheControl);
    if (r.kind === 'empty') return res.status(204).end();
    return res.status(200).json(r.value);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Momentum verisi şu an alınamıyor.' });
  }
}
