import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { fetchLiveScoreCached, isLiveScorePath } from '@/services/sportmonks/liveScoreCache';
import { fetchStatsCached, isStatsCacheable } from '@/services/sportmonks/statsCache';
import { reportSportmonksQuota } from '@/services/sportmonks/quotaMonitor';

/**
 * Tarayıcıdan gelen Sportmonks isteklerini gerçek `api.sportmonks.com`'a
 * yönlendirir — `SPORTMONKS_API_KEY` yalnızca burada, sunucu tarafında
 * okunur ve eklenir; istemciye asla gitmez (bkz. sportmonksRuntimeClient.ts).
 * `/api/livescore/[...path].ts` ile aynı proxy deseni. Cache YALNIZCA canlı skor
 * (`livescores/inplay`) için (bkz. services/sportmonks/liveScoreCache.ts);
 * gerçek upstream isteklerinin kotası burada Sentry'ye raporlanıyor
 * (bkz. quotaMonitor.ts).
 */
const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method && req.method.toUpperCase() !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const pathParam = req.query.path;
    const segments = Array.isArray(pathParam) ? pathParam : [String(pathParam ?? '')];
    const path = segments.join('/');

    const ip = requestIp(
      req.headers as Record<string, string | string[] | undefined>,
      req.socket?.remoteAddress,
    );
    const rl = await hitFixedWindowRateLimit(`sportmonks:${ip}`, 100, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ message: 'Too many requests' });
    }

    const apiToken = process.env.SPORTMONKS_API_KEY;
    if (!apiToken) {
      return res.status(500).json({ message: 'Missing Sportmonks API credentials' });
    }

    const query = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (key === 'path' || key === 'api_token') return;
      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
      } else if (value !== undefined) {
        query.append(key, String(value));
      }
    });
    query.set('api_token', apiToken);

    // Tek gerçek upstream çağrısı — kota buradan raporlanır (tarayıcı tarafı raporlamaz).
    const callUpstream = async () => {
      const upstream = await fetch(`${SPORTMONKS_BASE}/${path}?${query.toString()}`);
      const data = await upstream.json();
      const rl = (data as { rate_limit?: { requested_entity: string; remaining: number; resets_in_seconds: number } })
        ?.rate_limit;
      if (rl) {
        reportSportmonksQuota({
          pool: rl.requested_entity,
          remaining: rl.remaining,
          resetsInSeconds: rl.resets_in_seconds,
          path: `/${path}`,
        });
      }
      return { status: upstream.status, data };
    };

    if (isLiveScorePath(path)) {
      const result = await fetchLiveScoreCached(req.query, callUpstream);
      res.setHeader('X-Cache', result.cache);
      return res.status(result.status).json(result.data);
    }

    if (isStatsCacheable(path, req.query)) {
      const result = await fetchStatsCached(path, req.query, callUpstream);
      res.setHeader('X-Cache', result.cache);
      return res.status(result.status).json(result.data);
    }

    const upstream = await callUpstream();
    res.status(upstream.status).json(upstream.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    res.status(500).json({ message });
  }
}
