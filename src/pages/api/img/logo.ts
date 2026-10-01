/**
 * GET /api/img/logo?src=<sportmonks yolu>&w=<32|48|64|96|128> — bkz. server/imgLogo.ts.
 * CDN'de 1 yıl immutable; fonksiyon yalnız ıskada (yol × genişlik başına bir kez, bölge başına) çalışır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { parseLogoQuery, renderLogo } from '@/server/imgLogo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const query = parseLogoQuery(req.query.src, req.query.w);
  if (!query) {
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(400).end();
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`img-logo:${ip}`, 300, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).end();
  }

  const result = await renderLogo(query.path, query.width);
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  if (result.status === 302) return res.redirect(302, result.location);
  if (result.status === 200) return res.status(200).send(result.body);
  return res.status(result.status).end();
}
