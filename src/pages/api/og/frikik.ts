/**
 * GET /api/og/frikik[?s=<skor>] ya da [?l=<seviye>&s=<puan>] — /frikik paylaşım görseli (1200×630 PNG). Seri skoru yalnız
 * olası değerlerden (0–1250, 50'nin katı); seviye kartı l ≤ 999 ve puan o seviyenin üst sınırını aşmaz → adres uzayı
 * sınırlı; geçersiz parametre skorsuz adrese yönlendirilir (önbellek kırılıp CPU harcatılamaz).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { captureError } from '@/lib/logger';
import { parseShare, shareImagePath } from '@/lib/frikik/share';
import { renderFrikikOgImage } from '@/server/og/frikikOgImage';
import { OG_CACHE } from '@/server/og/ogCache';
import { redirect, sendImageResponse } from '@/server/og/sendImage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const info = parseShare(req.query);
  if ((req.query.s != null || req.query.l != null) && !info) return redirect(res, shareImagePath(null), OG_CACHE.versionRedirect);
  try {
    // Sonuç adreste → görsel hiç değişmez.
    return await sendImageResponse(res, renderFrikikOgImage(info), OG_CACHE.finished);
  } catch (err) {
    captureError('og-frikik', err);
    return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
  }
}
