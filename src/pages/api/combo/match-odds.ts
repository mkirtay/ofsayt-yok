/**
 * Milli maç detayı "Piyasa oranları" kartının ucu: GET ?id=<uygulama maç id'si (2e9+)> → { odds: MatchOddsView | null }.
 * Bayrak kapalı (COMBO_TOOL_ENABLED / NATIONAL_MATCHES_ENABLED) ya da yetkisiz → 404; kombine aracıyla AYNI kapı.
 * Sayfa açılışında en çok 1 AF isteği (15 dk önbellek, kombine bütçe havuzu).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { nationalMatchesEnabled } from '@/config/nationalMatches';
import { requireComboAccess } from '@/lib/requireComboAccess';
import { loadNationalMatchOdds } from '@/server/combo/matchOdds';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!nationalMatchesEnabled()) return res.status(404).json({ error: 'Not found' });
  const guard = await requireComboAccess(req, res);
  if (!guard.ok) return;
  const r = await loadNationalMatchOdds(String(req.query.id ?? ''));
  if (!r.ok) return res.status(r.reason === 'not-national' ? 404 : 502).json({ error: r.reason });
  return res.status(200).json({ odds: r.odds });
}
