/**
 * GET /api/leagues/season-stats?league={sportmonksLeagueId}&season={seasonId}
 * Puan Durumu "Sezon Özeti" (Haftanın Özeti kartının Sezon görünümü; bkz. server/seasonStats.ts). Kullanıcıdan bağımsız → CDN.
 * 200 `{season, summary}` (summary null = sezonda veri yok) · 400 geçersiz parametre / lig-sezon uyuşmuyor · 502 Sportmonks
 * hatası (önbelleğe yazılmaz; istemci "yüklenemedi · tekrar dene").
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadSeasonStats, SeasonStatsInputError } from '@/server/seasonStats';

const INT = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const league = String(req.query.league ?? '');
  const season = String(req.query.season ?? '');
  if (!INT.test(league) || !INT.test(season)) return res.status(400).json({ error: 'Geçersiz parametre' });
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  // Haftanın Özeti ile aynı pencere: kart iki ucu da kullanır.
  const rl = await hitFixedWindowRateLimit(`round-stats:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const payload = await loadSeasonStats(Number(league), Number(season));
    res.setHeader(
      'Cache-Control',
      payload.season.finished ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=3600, stale-while-revalidate=21600',
    );
    return res.status(200).json(payload);
  } catch (e) {
    if (e instanceof SeasonStatsInputError) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(400).json({ error: 'Geçersiz lig / sezon' });
    }
    console.warn('[season-stats] yüklenemedi', e instanceof Error ? e.message : e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Veri yüklenemedi' });
  }
}
