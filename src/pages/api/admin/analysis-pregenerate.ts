/**
 * POST /api/admin/analysis-pregenerate — popüler maçların AI analizini maçtan ~3 saat önce üretir
 * (bkz. server/analysisPregen.ts). Tetikleyici: GitHub Actions (15 dk), `Authorization: Bearer $CRON_SECRET`.
 * Yönetici oturumuyla elle de çağrılabilir. `?dryRun=1`: yalnız adayları listeler (LLM çağrısı yok).
 *
 * Yanıt: aday sayısı, seçim için Sportmonks çağrıları, maç başına durum / süre / token / Sportmonks istekleri.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/lib/requireAuth';
import { runAnalysisPregen, type PregenResult } from '@/server/analysisPregen';
import { captureError } from '@/lib/logger';

export const config = { maxDuration: 120 };

function isValidCronRequest(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<PregenResult | { error: string }>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isValidCronRequest(req)) {
    const guard = await requireAdmin(req, res);
    if (!guard.ok) return;
  }
  try {
    const result = await runAnalysisPregen({ dryRun: req.query.dryRun === '1' });
    console.log(JSON.stringify({ event: 'analysis-pregen-run', candidates: result.candidates, ms: result.ms, selection: result.selection, items: result.items.map(({ matchId, status, ms }) => ({ matchId, status, ms })) }));
    return res.status(200).json(result);
  } catch (e) {
    captureError('analysis-pregen-run', e);
    return res.status(500).json({ error: 'Ön üretim çalıştırılamadı.' });
  }
}
