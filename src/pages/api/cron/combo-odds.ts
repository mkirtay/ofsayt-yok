/**
 * POST /api/cron/combo-odds — günlük oran toplama (harici cron-job.org; bot-tick deseni): YALNIZCA `Authorization: Bearer $CRON_SECRET`,
 * sır asla query'de. COMBO_TOOL_ENABLED kapalıyken 404 (hiçbir iş yok). Tablo yoksa 200 + `skipped: "no-table"`.
 * Vercel crons'a EKLENMEZ; zamanlama docs/KOMBINE_ARACI.md'deki adımlarla elle kurulur.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { comboToolEnabled } from '@/config/comboTool';
import { isValidCronRequest } from '@/lib/gundem/botAuth';
import { captureError } from '@/lib/logger';
import { runComboOddsSnapshot } from '@/server/combo/oddsSnapshot';

export const config = { maxDuration: 60 };

const SECRET_LIKE_QUERY = /secret|token|key|auth|password/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!comboToolEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (Object.keys(req.query).some((k) => SECRET_LIKE_QUERY.test(k))) {
    return res.status(400).json({ error: 'Sırlar query string ile gönderilemez; Authorization başlığını kullanın.' });
  }
  if (!isValidCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    return res.status(200).json({ ok: true, summary: await runComboOddsSnapshot() });
  } catch (e) {
    captureError('combo-odds-snapshot', e);
    return res.status(500).json({ error: 'Oran toplama çalıştırılamadı.' });
  }
}
