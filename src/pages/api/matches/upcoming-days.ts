/**
 * GET /api/matches/upcoming-days?from=YYYY-MM-DD[&leagues=600,8] — liglerin `from`'dan sonraki ilk maç günü.
 * Boş gün ekranı ("Süper Lig 9 Ekim'de dönüyor") için; yalnızca seçili günde maç yokken çağrılır.
 * `leagues` yoksa planımızdaki bütün ligler ("Tümü"); varsa yalnız onlar (plan dışı id'ler atılır, sıralanır →
 * aynı seçim aynı cache anahtarı). Sportmonks: Tümü 1 istek, filtreli en çok 3 (paylaşımlı cache 15 dk) + CDN 15 dk.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { loadUpcomingMatchDays, normalizeUpcomingLeagueIds } from '@/server/homeDay';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEAGUES_RE = /^\d{1,6}(,\d{1,6}){0,49}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const from = typeof req.query.from === 'string' ? req.query.from : '';
  const today = todayIsoIstanbul();
  if (!DATE_RE.test(from) || from < shiftIsoDate(today, -1) || from > shiftIsoDate(today, 60)) {
    return res.status(400).json({ error: 'Geçersiz tarih' });
  }
  const leaguesParam = req.query.leagues;
  if (leaguesParam !== undefined && (typeof leaguesParam !== 'string' || !LEAGUES_RE.test(leaguesParam))) {
    return res.status(400).json({ error: 'Geçersiz lig listesi' });
  }
  const leagueIds = typeof leaguesParam === 'string' ? normalizeUpcomingLeagueIds(leaguesParam.split(',').map(Number)) : null;

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`matches-upcoming:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value, stale, failed } = await trackSportmonksFetches(() => loadUpcomingMatchDays(from, leagueIds));
    if (failed && value.length === 0) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Fikstür şu an alınamıyor.' });
    }
    res.setHeader(
      'Cache-Control',
      stale || failed ? 'public, s-maxage=60, stale-while-revalidate=300' : 'public, s-maxage=900, stale-while-revalidate=2700',
    );
    return res.status(200).json({ from, leagues: value });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
