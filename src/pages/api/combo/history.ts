/**
 * GET /api/combo/history — Günün Kombinesi geçmişi: verilen tüm kuponlar ve sonucu (tuttu / tutmadı / bekliyor) + özet.
 * Şimdilik kombine kartıyla aynı kapı (ADMIN + COMBO_TOOL_USER_IDS, requireComboAccess); herkese açılınca kapı değişir.
 * Kaynak: ComboCouponLog (cron yazar, gece değerlendirme işi sonuçlandırır).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireComboAccess } from '@/lib/requireComboAccess';
import { loadCouponHistory } from '@/server/combo/couponLog';
import { captureError } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireComboAccess(req, res);
  if (!guard.ok) return;
  try {
    return res.status(200).json(await loadCouponHistory());
  } catch (e) {
    captureError('combo-history', e);
    return res.status(500).json({ error: 'Geçmiş yüklenemedi.' });
  }
}
