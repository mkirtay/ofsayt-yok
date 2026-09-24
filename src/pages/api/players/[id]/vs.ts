/**
 * GET /api/players/{id}/vs              → oyuncunun karşılaştığı rakipler
 * GET /api/players/{id}/vs?opponentId=34 → o rakibe karşı maçlar + özet
 *
 * Veri: `services/playerLineups` — oyuncu başına TEK Sportmonks isteği, sıkıştırılmış satırlar Redis'te 12 saat.
 * Oturum gerekmez (herkese açık istatistik); IP başına dakikada 60 istek. Mobil uygulama da bu uç noktayı kullanır.
 *
 * Yanıt (rakip listesi):  { playerId, opponents: [{ id, name, logo?, matches }] }   — matches: sahaya çıktığı maç, çoktan aza
 * Yanıt (rakip seçili):   { playerId, minMinutesForAverage: 15, opponent: { id, name, logo? } | null,
 *                           matches: PlayerLineupRow[] (sahaya çıktığı, en yeni önce), notPlayed: number,
 *                           summary: { played, won, drawn, lost, averageRating|null, ratedMatches, goals, assists, minutes } }
 *   G/B/M oyuncunun O MAÇTAKİ takımı açısından; averageRating yalnızca ≥15 dk ve reytingli maçlardan.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import {
  getPlayerLineupRows,
  listOpponents,
  MIN_MINUTES_FOR_AVERAGE,
  vsOpponent,
  type VsOpponent,
  type VsResult,
} from '@/services/playerLineups';

export type PlayerVsOpponentsResponse = { playerId: number; opponents: VsOpponent[] };
export type PlayerVsResponse = { playerId: number; minMinutesForAverage: number } & VsResult;

const ID_RE = /^\d{1,12}$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerVsOpponentsResponse | PlayerVsResponse | { error: string }>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`player-vs:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { id, opponentId } = req.query;
  if (typeof id !== 'string' || !ID_RE.test(id)) return res.status(400).json({ error: 'Geçersiz oyuncu id' });
  if (opponentId != null && (typeof opponentId !== 'string' || !ID_RE.test(opponentId))) {
    return res.status(400).json({ error: 'Geçersiz opponentId' });
  }

  let rows;
  try {
    rows = await getPlayerLineupRows(Number(id));
  } catch (error) {
    console.error('player vs: Sportmonks isteği başarısız', error);
    return res.status(502).json({ error: 'Veri alınamadı' });
  }
  if (!rows) return res.status(404).json({ error: 'Oyuncu bulunamadı' });

  // Satırlar sunucuda 12 saat cache'li; CDN kısa: yeni biten maç en geç ~12,5 saatte görünür
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
  const playerId = Number(id);
  if (opponentId == null) return res.status(200).json({ playerId, opponents: listOpponents(rows) });
  return res.status(200).json({ playerId, minMinutesForAverage: MIN_MINUTES_FOR_AVERAGE, ...vsOpponent(rows, Number(opponentId)) });
}
