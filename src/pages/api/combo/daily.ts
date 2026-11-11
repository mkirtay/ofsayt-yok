/**
 * Ana sayfa kartının "hazır öneriler" ucu: GET ?date=YYYY-MM-DD (bugün / yarın, Türkiye günü) → günlük kupon yükü.
 * Kapı: COMBO_TOOL_ENABLED + ADMIN / COMBO_TOOL_USER_IDS (requireComboAccess). Yük cron tarafından üretilip Redis'e konur; yoksa
 * `pending` (üretimde burada HESAPLANMAZ). Yalnız geliştirmede (test analiz dosyası tanımlıyken) önbellek boşsa anında üretilir.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireComboAccess } from '@/lib/requireComboAccess';
import { buildDailyCoupons, readDaily, writeDaily, parseDailyTime } from '@/server/combo/dailyCoupons';
import { comboTestAnalysesPath } from '@/server/combo/testAnalyses';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireComboAccess(req, res);
  if (!guard.ok) return;

  const today = todayIsoIstanbul();
  const date = String(req.query.date ?? today);
  if (date !== today && date !== shiftIsoDate(today, 1)) return res.status(400).json({ error: 'date bugün ya da yarın olmalı.' });

  const cached = await readDaily(date);
  if (cached) return res.status(200).json({ state: 'ready', payload: cached });
  if (comboTestAnalysesPath()) {
    const payload = await buildDailyCoupons(date);
    await writeDaily(payload);
    return res.status(200).json({ state: 'ready', payload });
  }
  const t = parseDailyTime(process.env.COMBO_DAILY_TIME);
  return res.status(200).json({ state: 'pending', at: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` });
}
