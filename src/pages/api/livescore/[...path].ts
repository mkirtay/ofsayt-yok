import type { NextApiRequest, NextApiResponse } from 'next';

const API_BASE = 'https://livescore-api.com/api-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const pathParam = req.query.path;
    const path = Array.isArray(pathParam) ? pathParam.join('/') : String(pathParam || '');

    const key = process.env.LIVESCORE_API_KEY || process.env.NEXT_PUBLIC_LIVESCORE_API_KEY;
    const secret = process.env.LIVESCORE_API_SECRET || process.env.NEXT_PUBLIC_LIVESCORE_API_SECRET;

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
    res.status(upstream.status).json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Proxy error' });
  }
}
