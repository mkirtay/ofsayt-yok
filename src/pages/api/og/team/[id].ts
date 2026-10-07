/**
 * GET /api/og/team/{id}?v={gün} — takım paylaşım görseli (1200×630 PNG).
 *
 * Görseldeki her şey sunucudaki takım verisinden (takım sayfasıyla aynı önbellekli istekler, 3 sn bütçe); adres
 * yalnız kimlik ve gün taşır. `v` bugün / dün değilse çizmeden güncel adrese yönlendirir (önbellek kırılıp CPU
 * harcatılamaz). CDN 1 gün. Takım yok / geçici hata → varsayılan paylaşım görseline 307 (kısa önbellek). İzinli sorgu
 * anahtarı yalnız `v`; kanonik olmayan adres (fazla / tekrarlı parametre, baştaki sıfır …) çizmeden 308. Veri okuma +
 * çizim IP başına, çizim ayrıca global bütçeyle sınırlı (bkz. server/og/ogGuard.ts).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } from '@/server/sportmonks/cachedFetch';
import { OG_CACHE } from '@/server/og/ogCache';
import { loadTeamOgData } from '@/server/og/teamOgData';
import { renderTeamOgImage } from '@/server/og/teamOgImage';
import { redirect, sendImageResponse } from '@/server/og/sendImage';
import { isAcceptedTeamOgVersion, teamOgImagePath } from '@/utils/teamOgImage';
import { captureError } from '@/lib/logger';
import {
  allowOgRender,
  allowOgWorkForIp,
  canonicalNumericId,
  canonicalQuery,
  firstQueryValue,
  rawPathSegment,
  redirectIfNotCanonical,
} from '@/server/og/ogGuard';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const id = canonicalNumericId(req.query.id, 9);
  if (!id) return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
  const v = firstQueryValue(req.query.v);
  const canonical = `/api/og/team/${id}${canonicalQuery([['v', v && v.length <= 64 ? v : null]])}`;
  if (redirectIfNotCanonical(req, res, canonical, { name: 'id', rawValue: rawPathSegment(req, '/api/og/team/') })) {
    return;
  }
  if (!isAcceptedTeamOgVersion(v)) return redirect(res, teamOgImagePath(id), OG_CACHE.versionRedirect);
  if (!(await allowOgWorkForIp(req, res, 'team'))) return;

  try {
    const data = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => loadTeamOgData(id));
    if (!data) return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
    if (!(await allowOgRender(res, 'team'))) return;
    return await sendImageResponse(res, await renderTeamOgImage(data), OG_CACHE.team);
  } catch (err) {
    captureError('og-team', err);
    return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
  }
}
