/**
 * GET /api/matches/day?date=YYYY-MM-DD — ana sayfanın günlük maç verisi (normalize, sağlayıcıdan bağımsız).
 *
 * Tarayıcı ham Sportmonks path'leri yerine bunu çağırır (bkz. server/homeDay.ts). CDN süresi maç
 * durumuna göre (canlı 20 sn, aktif 30 sn, aksi halde sıradaki başlamaya kadar). Upstream hatasında
 * son geçerli veri `stale: true` ile döner; hiç veri yoksa 503 (istemci önceki veriyi korur, üstel bekler).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { livescoreServerClient } from '@/server/livescoreInternalAxios';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { homeDayFreshSeconds, loadHomeDay } from '@/server/homeDay';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Tarih şeridi/takvim ±1 yıl — daha uzak tarihler bot/tarama gürültüsü. */
const MAX_RANGE_DAYS = 400;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  const today = todayIsoIstanbul();
  if (!DATE_RE.test(date) || date < shiftIsoDate(today, -MAX_RANGE_DAYS) || date > shiftIsoDate(today, MAX_RANGE_DAYS)) {
    return res.status(400).json({ error: 'Geçersiz tarih' });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`matches-day:${ip}`, 120, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { value, stale, failed } = await trackSportmonksFetches(() =>
      runWithLiveScoreHttpClient(livescoreServerClient(), () => loadHomeDay(date)),
    );
    const empty = value.fixtureMatches.length + value.liveMatches.length + (value.historyMatches?.length ?? 0) === 0;
    if (failed && empty) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'Maç verileri şu an alınamıyor.' });
    }
    const degraded = stale || failed;
    const fresh = homeDayFreshSeconds(value, today);
    res.setHeader(
      'Cache-Control',
      degraded ? 'public, s-maxage=15, stale-while-revalidate=60' : `public, s-maxage=${fresh}, stale-while-revalidate=${fresh * 3}`,
    );
    return res.status(200).json({ ...value, stale: degraded });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
