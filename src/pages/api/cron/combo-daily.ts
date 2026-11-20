/**
 * GET (Vercel Cron, vercel.json) / POST /api/cron/combo-daily — günlük otomatik kuponları üretip Redis'e ve ComboCouponLog'a yazar: YALNIZCA
 * `Authorization: Bearer $CRON_SECRET`, sır asla query'de. COMBO_TOOL_ENABLED kapalıyken 404. Saat: `COMBO_DAILY_TIME` (Türkiye, varsayılan
 * 11:00) — saat gelmeden `too-early` (`?force=1` aşar). Bugün + yarın için üretir; yeterli veri yoksa "insufficient" yazılır (sonraki tikte
 * yeniden denenir). O gün "ok" kupon varsa yeniden hesaplanır ama YALNIZ daha çok analizli maç varsa ve eski kuponun hiçbir maçı başlamamışsa
 * değiştirilir (`refreshed`), yoksa `already`. Kayıt tablosu yoksa atlanır.
 * Vercel Cron: 11:00 ve 13:00 TSİ (vercel.json). Havuz maçlarının analizi 09:00'dan itibaren üretilir (server/combo/comboPregen.ts).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { comboToolEnabled } from '@/config/comboTool';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { captureError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { buildDailyCoupons, istanbulMinutes, parseDailyTime, readDaily, shouldRefreshDaily, writeDaily } from '@/server/combo/dailyCoupons';
import { saveCouponLog } from '@/server/combo/couponLog';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';

export const config = { maxDuration: 60 };

const SECRET_LIKE_QUERY = /secret|token|key|auth|password/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!comboToolEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  if (Object.keys(req.query).some((k) => SECRET_LIKE_QUERY.test(k))) {
    return res.status(400).json({ error: 'Sırlar query string ile gönderilemez; Authorization başlığını kullanın.' });
  }
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });

  const force = req.query.force === '1';
  if (!force && istanbulMinutes(Date.now()) < parseDailyTime(process.env.COMBO_DAILY_TIME)) return res.status(200).json({ ok: true, skipped: 'too-early' });
  try {
    const today = todayIsoIstanbul();
    const out: Array<{ date: string; status: string; coupons: number; analysed?: number; logged?: string | number }> = [];
    for (const date of [today, shiftIsoDate(today, 1)]) {
      const existing = force ? null : await readDaily(date);
      const payload = await buildDailyCoupons(date);
      if (existing?.status === 'ok' && !shouldRefreshDaily(existing, payload, Date.now())) {
        out.push({ date, status: 'already', coupons: existing.coupons.length });
        continue;
      }
      await writeDaily(payload);
      const log = await saveCouponLog((t, v) => prisma.$executeRawUnsafe(t, ...v), payload);
      const status = existing?.status === 'ok' ? 'refreshed' : payload.status;
      out.push({ date, status, coupons: payload.coupons.length, analysed: payload.analysed, logged: log.skipped ?? log.written });
    }
    return res.status(200).json({ ok: true, summary: out });
  } catch (e) {
    captureError('combo-daily', e);
    return res.status(500).json({ error: 'Günlük kupon üretilemedi.' });
  }
}
