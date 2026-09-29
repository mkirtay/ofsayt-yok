import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { fetchSportmonksCached, sportmonksCacheControl } from '@/server/sportmonks/cachedFetch';

/**
 * Tarayıcıdan gelen Sportmonks isteklerini gerçek `api.sportmonks.com`'a
 * yönlendirir — `SPORTMONKS_API_KEY` yalnızca sunucuda eklenir; istemciye asla
 * gitmez (bkz. sportmonksRuntimeClient.ts).
 *
 * Tüm GET'ler paylaşımlı cache'ten geçer (bkz. server/sportmonks/cachedFetch.ts —
 * sunucu içi çağrılarla AYNI cache): süre endpoint'e ve maç durumuna göre, aynı
 * anda gelen aynı istekler tek upstream isteğine iner, Sportmonks hata verirse son
 * geçerli veri döner. `Cache-Control: s-maxage` ile Vercel edge tekrarları fonksiyona
 * uğramadan karşılar. Yanıttan `subscription`/`rate_limit` çıkarılır; kota Sentry'ye
 * cache katmanından raporlanır.
 */
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

    if (!process.env.SPORTMONKS_API_KEY) {
      return res.status(500).json({ message: 'Missing Sportmonks API credentials' });
    }

    const query: Record<string, string | string[] | undefined> = { ...req.query };
    delete query.path;
    delete query.api_token;

    const result = await fetchSportmonksCached(path, query, { origin: 'proxy' });
    res.setHeader('Cache-Control', sportmonksCacheControl(result));
    res.setHeader('X-Cache', result.cache);
    if (result.stale) res.setHeader('X-Data-Stale', '1');
    return res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ message });
  }
}
