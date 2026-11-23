/**
 * Davet (büyüme raporu 2.3) — GET: davet kodum, linkim, davet ettiğim / ödül alan sayısı; POST { code }: yeni hesabı
 * (Google ile kayıt dahil, ilk 48 saat) davet koduna bağlar. Ödül kuralları: lib/referral.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/requireAuth';
import { captureError } from '@/lib/logger';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { readJsonBody } from '@/lib/gundem/validation';
import { siteBaseUrl } from '@/lib/siteUrl';
import { claimReferralForNewUser, ensureReferralCode, referralStats, REFERRAL_BONUS_CREDITS } from '@/lib/referral';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    if (req.method === 'GET') {
      const code = await ensureReferralCode(guard.userId);
      const stats = await referralStats(guard.userId);
      return res.status(200).json({
        code,
        url: `${siteBaseUrl()}/davet/${code}`,
        ...stats,
        rewardActive: true,
        bonus: REFERRAL_BONUS_CREDITS,
      });
    }
    const rl = await hitFixedWindowRateLimit(`referral-claim:user:${guard.userId}`, 5, 3_600_000);
    if (!rl.success) return res.status(429).json({ error: 'Çok fazla istek.' });
    const body = readJsonBody(req) as { code?: unknown };
    return res.status(200).json({ linked: await claimReferralForNewUser(guard.userId, body.code) });
  } catch (e) {
    captureError('user-referral', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
