/**
 * GET /api/players/{id}/matches → oyuncunun son tamamlanmış maçları (rating grafiği + Maç Geçmişi; web ve mobil).
 *
 * Veri `/vs` ile AYNI: `services/playerLineups` — oyuncu başına TEK Sportmonks isteği, satırlar Redis'te 12 saat.
 * Yanıt: { playerId, minMinutesForAverage: 15, rows: PlayerLineupRow[] }
 *   rows: en yeni önce, hangi takımda oynadığından bağımsız; sahaya çıktığı 20. maça kadar olan tüm satırlar
 *   ("kadroda, oynamadı" satırları dahil — `started=false` ve `minutes` yok). Kurallar: `utils/playerVs`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { getPlayerLineupRows, MIN_MINUTES_FOR_AVERAGE, recentRows, type PlayerLineupRow } from '@/services/playerLineups';

export type PlayerMatchesResponse = { playerId: number; minMinutesForAverage: number; rows: PlayerLineupRow[] };

const ID_RE = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse<PlayerMatchesResponse | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`player-matches:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }
  const { id } = req.query;
  if (typeof id !== 'string' || !ID_RE.test(id)) return res.status(400).json({ error: 'Geçersiz oyuncu id' });

  let rows;
  try {
    rows = await getPlayerLineupRows(Number(id));
  } catch (error) {
    console.error('player matches: Sportmonks isteği başarısız', error);
    return res.status(502).json({ error: 'Veri alınamadı' });
  }
  if (!rows) return res.status(404).json({ error: 'Oyuncu bulunamadı' });

  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json({ playerId: Number(id), minMinutesForAverage: MIN_MINUTES_FOR_AVERAGE, rows: recentRows(rows) });
}
