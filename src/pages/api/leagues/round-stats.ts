/**
 * GET /api/leagues/round-stats?league={sportmonksLeagueId}&season={seasonId}[&unit=r{roundId}|s{stageId}]
 * Lig sayfası "Haftanın Özeti" kartı (bkz. server/roundStats.ts). Kullanıcıdan bağımsız → CDN'de paylaşılır.
 * 200 `{mode, units, selected, summary}` (summary null = o hafta veri yok) · 400 geçersiz parametre / lig-sezon-birim
 * uyuşmuyor · 502 Sportmonks hatası (önbelleğe yazılmaz; istemci "yüklenemedi · tekrar dene").
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadRoundStats, roundStatsSwrOptions, RoundStatsInputError } from '@/server/roundStats';
import { istanbulToday, parseStatUnitKey, statUnitKey } from '@/services/sportmonks/roundStats';

const INT = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const league = String(req.query.league ?? '');
  const season = String(req.query.season ?? '');
  const unitRaw = req.query.unit == null ? null : String(req.query.unit);
  if (!INT.test(league) || !INT.test(season) || (unitRaw != null && !parseStatUnitKey(unitRaw))) {
    return res.status(400).json({ error: 'Geçersiz parametre' });
  }
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const rl = await hitFixedWindowRateLimit(`round-stats:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const payload = await loadRoundStats(Number(league), Number(season), unitRaw);
    const unit = payload.units.find((u) => statUnitKey(u) === payload.selected);
    const settled = unit != null && roundStatsSwrOptions(unit, istanbulToday()).freshSeconds > 2 * 3600;
    res.setHeader(
      'Cache-Control',
      settled ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'public, s-maxage=900, stale-while-revalidate=3600',
    );
    return res.status(200).json(payload);
  } catch (e) {
    if (e instanceof RoundStatsInputError) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(400).json({ error: 'Geçersiz lig / sezon / hafta' });
    }
    console.warn('[round-stats] yüklenemedi', e instanceof Error ? e.message : e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Veri yüklenemedi' });
  }
}
