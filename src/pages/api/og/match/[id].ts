/**
 * GET /api/og/match/{id}?v={sürüm} — maç paylaşım görseli (1200×630 PNG).
 *
 * Güvenlik: görseldeki her metin / logo sunucudaki maç verisinden (önbellekli Sportmonks) gelir; adres yalnız kimlik
 * ve sürüm taşır. Maliyet: `v` güncel sürüm değilse çizmeden güncel adrese yönlendirir (rastgele `v` ile önbellek
 * kırılıp CPU harcatılamaz); CDN süreleri maç durumuna göre (bkz. server/og/ogCache.ts).
 * Maç yok / geçici hata → varsayılan paylaşım görseline 307 (kısa önbellek).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { resolveSportmonksMatch } from '@/lib/resolveLiveMatch';
import { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } from '@/server/sportmonks/cachedFetch';
import { OG_CACHE, matchOgCacheControl } from '@/server/og/ogCache';
import { renderMatchOgImage } from '@/server/og/matchOgImage';
import { redirect, sendImageResponse } from '@/server/og/sendImage';
import { matchOgImagePath, matchOgVersion } from '@/utils/matchOgImage';
import { captureError } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const id = String(req.query.id ?? '');
  if (!/^\d{1,12}$/.test(id)) return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);

  try {
    // Botlar beklemez: sayfa render'ı bütçesi. Veri maç sayfasıyla aynı önbellekten (çoğunlukla HIT).
    const lookup = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () =>
      resolveSportmonksMatch(id, { lookupAmbiguous: true }),
    );
    if (lookup.kind !== 'found') return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
    const match = lookup.match;

    if (req.query.v !== matchOgVersion(match)) {
      return redirect(res, matchOgImagePath(match), OG_CACHE.versionRedirect);
    }
    return await sendImageResponse(res, await renderMatchOgImage(match), matchOgCacheControl(match));
  } catch (err) {
    captureError('og-match', err);
    return redirect(res, OG_DEFAULT_IMAGE.path, OG_CACHE.fallback);
  }
}
