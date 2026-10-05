/**
 * GET /api/og/frikik[?s=<skor>] — /frikik paylaşım görseli (1200×630 PNG). Skor yalnız olası değerlerden (0–1250,
 * 50'nin katı) → en çok 27 farklı görsel; geçersiz `s` skorsuz adrese yönlendirilir (önbellek kırılıp CPU harcatılamaz).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { captureError } from '@/lib/logger';
import { parseShareScore, shareImagePath } from '@/lib/frikik/share';
import { renderFrikikOgImage } from '@/server/og/frikikOgImage';
import { OG_CACHE } from '@/server/og/ogCache';
import { redirect, sendImageResponse } from '@/server/og/sendImage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const score = parseShareScore(req.query.s);
  if (req.query.s != null && score == null) return redirect(res, shareImagePath(null), OG_CACHE.versionRedirect);
  try {
    // Skor adreste → görsel hiç değişmez.
    return await sendImageResponse(res, renderFrikikOgImage(score), OG_CACHE.finished);
  } catch (err) {
    captureError('og-frikik', err);
    return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
  }
}
