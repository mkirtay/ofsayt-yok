/**
 * GET /api/rewards/weekly-gift — bu TR haftasının hediyesi alınabilir mi (2 kredi; doğrulanmış e-posta şartı).
 * POST /api/rewards/weekly-gift — hediyeyi alır (hafta başına bir kez; tekrar → 409). Kurallar lib/weeklyGift.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { requireAuth } from '@/lib/requireAuth';
import { claimWeeklyGift, loadWeeklyGift } from '@/server/rewards';

const CLAIM_LIMIT = 10;
const CLAIM_WINDOW_MS = 10 * 60_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    if (req.method === 'GET') return res.status(200).json(await loadWeeklyGift(guard.userId));

    const rl = await hitFixedWindowRateLimit(`rewards:weekly-gift:${guard.userId}`, CLAIM_LIMIT, CLAIM_WINDOW_MS);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Çok fazla deneme. Biraz sonra tekrar dene.', code: 'RATE_LIMITED' });
    }
    const out = await claimWeeklyGift(guard.userId);
    if (out.result === 'granted') return res.status(200).json({ ok: true, credits: out.balance });
    if (out.result === 'duplicate') return res.status(409).json({ error: 'Bu haftanın hediyesini zaten aldın.', code: 'ALREADY_CLAIMED' });
    return res.status(403).json({ error: 'Hediye için önce e-posta adresini doğrula.', code: 'UNVERIFIED' });
  } catch (err) {
    captureError('rewards-weekly-gift', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
