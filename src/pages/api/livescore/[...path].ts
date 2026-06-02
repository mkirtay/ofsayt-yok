import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import {
  buildCacheKey,
  getCacheTtlSeconds,
  readCache,
  writeCache,
} from '@/lib/livescoreCache';

const API_BASE = 'https://livescore-api.com/api-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const pathParam = req.query.path;
    const path = Array.isArray(pathParam) ? pathParam.join('/') : String(pathParam || '');

    // Rate limiting — görsel istekler zaten önbelleğe alınır, asıl maliyet JSON verileri
    const ip = requestIp(
      req.headers as Record<string, string | string[] | undefined>,
      req.socket?.remoteAddress,
    );
    const isBinaryPath = /\.(png|jpe?g|gif|webp)$/i.test(path);
    const rlKey = `livescore:${isBinaryPath ? 'img' : 'data'}:${ip}`;
    const rlLimit = isBinaryPath ? 300 : 100;
    const rl = await hitFixedWindowRateLimit(rlKey, rlLimit, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ success: false, error: 'Too many requests' });
    }

    // Paylaşımlı cache: yalnızca GET + JSON endpoint'leri için. Tüm istemciler
    // aynı upstream yanıtını paylaşır → upstream istek sayısı istemci sayısından
    // bağımsız kalır ve günlük request kotası korunur.
    const isGet = !req.method || req.method.toUpperCase() === 'GET';
    const cacheTtl = !isBinaryPath && isGet ? getCacheTtlSeconds(path) : null;
    const cacheKey = cacheTtl != null ? buildCacheKey(path, req.query) : null;

    if (cacheKey && cacheTtl != null) {
      const cached = await readCache(cacheKey);
      if (cached !== null && cached !== undefined) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Cache-Control', `public, s-maxage=${cacheTtl}, stale-while-revalidate=${cacheTtl * 2}`);
        return res.status(200).json(cached);
      }
    }

    const key = process.env.LIVESCORE_API_KEY;
    const secret = process.env.LIVESCORE_API_SECRET;

    if (!key || !secret) {
      return res.status(500).json({ success: false, error: 'Missing API credentials' });
    }

    const query = new URLSearchParams();
    Object.entries(req.query).forEach(([k, v]) => {
      if (k === 'path') return;
      if (Array.isArray(v)) {
        v.forEach((item) => query.append(k, item));
      } else if (v !== undefined) {
        query.append(k, String(v));
      }
    });
    query.set('key', key);
    query.set('secret', secret);

    const isBinaryAsset = /\.(png|jpe?g|gif|webp)$/i.test(path);
    const url = isBinaryAsset
      ? `${API_BASE}/${path}?${query.toString()}`
      : `${API_BASE}/${path}.json?${query.toString()}`;

    const upstream = await fetch(url);
    const contentType = upstream.headers.get('content-type') || '';
    // Örn. countries/flag.json PNG döndürür (Content-Type: image/png)
    const treatAsBinary = isBinaryAsset || contentType.startsWith('image/');

    if (treatAsBinary) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      const ct = contentType || 'application/octet-stream';
      res.status(upstream.status).setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buf);
    }

    const data = await upstream.json();

    // Yalnızca başarılı yanıtları cache'le (hata/`success:false` yanıtları kotayı
    // gereksiz "iyi" veri gibi cache'lememek için dışarıda bırakılır).
    const isSuccessful =
      upstream.status === 200 &&
      (data == null || typeof data !== 'object' || (data as { success?: unknown }).success !== false);
    if (cacheKey && cacheTtl != null && isSuccessful) {
      void writeCache(cacheKey, data, cacheTtl);
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Cache-Control', `public, s-maxage=${cacheTtl}, stale-while-revalidate=${cacheTtl * 2}`);
    }

    res.status(upstream.status).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    res.status(500).json({ success: false, error: message });
  }
}
