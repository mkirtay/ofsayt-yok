/**
 * GET /api/frikik/leaderboard[?day=YYYY-MM-DD] — günün ve ayın en iyi 20'si (herkese açık; kişisel veri yok: takma ad,
 * seviye, puan, gün). Varsayılan gün: bugün (TR). Redis 30 sn + CDN 30 sn; IP başına hız sınırı.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseDayKey, todayKey } from '@/lib/frikik/daily';
import { captureError } from '@/lib/logger';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { LEADERBOARD_CACHE_SECONDS, loadLeaderboard } from '@/server/frikik/leaderboardService';

export const LEADERBOARD_IP_LIMIT = 60;
export const LEADERBOARD_IP_WINDOW_MS = 60_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`frikik-lb:ip:${ip}`, LEADERBOARD_IP_LIMIT, LEADERBOARD_IP_WINDOW_MS);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Çok fazla istek gönderdiniz. Biraz bekleyin.' });
  }
  const dayRaw = Array.isArray(req.query.day) ? req.query.day[0] : req.query.day;
  const day = dayRaw == null ? todayKey(Date.now()) : parseDayKey(dayRaw) != null ? dayRaw : null;
  if (!day) return res.status(400).json({ error: 'Geçersiz gün.' });
  try {
    const board = await loadLeaderboard(day);
    res.setHeader('Cache-Control', `public, s-maxage=${LEADERBOARD_CACHE_SECONDS}, stale-while-revalidate=60`);
    return res.status(200).json(board);
  } catch (err) {
    captureError('frikik-leaderboard', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
