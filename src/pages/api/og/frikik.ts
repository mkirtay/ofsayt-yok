/**
 * GET /api/og/frikik[?l=<seviye>&s=<puan>] — /frikik paylaşım görseli (1200×630 PNG). Seviye kartı: l ≤ 999 ve puan o
 * seviyenin üst sınırını aşmaz → adres uzayı sınırlı. İzinli anahtarlar yalnız `l`, `s`; kanonik olmayan her adres
 * (geçersiz / fazla / tekrarlı parametre, eski `?s=` seri bağlantısı, baştaki sıfır, farklı sıra) çizmeden kanonik adrese
 * 308 (bkz. server/og/ogGuard.ts) → önbellek kırılıp CPU harcatılamaz. Çizim IP başına ve global bütçeyle sınırlı.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { captureError } from '@/lib/logger';
import { parseShare, shareImagePath } from '@/lib/frikik/share';
import { renderFrikikOgImage } from '@/server/og/frikikOgImage';
import { OG_CACHE } from '@/server/og/ogCache';
import { redirect, sendImageResponse } from '@/server/og/sendImage';
import { allowOgRender, allowOgWorkForIp, redirectIfNotCanonical } from '@/server/og/ogGuard';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const info = parseShare(req.query);
  if (redirectIfNotCanonical(req, res, shareImagePath(info))) return;
  if (!(await allowOgWorkForIp(req, res, 'frikik')) || !(await allowOgRender(res, 'frikik'))) return;
  try {
    // Sonuç adreste → görsel hiç değişmez.
    return await sendImageResponse(res, renderFrikikOgImage(info), OG_CACHE.finished);
  } catch (err) {
    captureError('og-frikik', err);
    return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
  }
}
