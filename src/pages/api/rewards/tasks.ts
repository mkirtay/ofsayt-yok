/**
 * GET /api/rewards/tasks — başlangıç görevlerinin durumu (yapıldı mı / ödül alındı mı) + e-posta doğrulandı mı.
 * POST /api/rewards/tasks { task } — yapılmış görevin ödülünü alır (+1 kredi, bir kez; yalnız doğrulanmış e-posta).
 * Kurallar lib/rewards.ts, DB server/rewards.ts. Kişiye özel → önbellek yok.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { requireAuth } from '@/lib/requireAuth';
import { isOnboardingTask } from '@/lib/rewards';
import { claimOnboardingTask, loadOnboardingTasks } from '@/server/rewards';

const MESSAGES = {
  NOT_DONE: 'Bu görev henüz tamamlanmadı.',
  ALREADY_CLAIMED: 'Bu ödülü zaten aldın.',
  UNVERIFIED: 'Ödül için önce e-posta adresini doğrula.',
} as const;

/** Kullanıcı başına 10 dk'da en çok 20 alma denemesi. */
const CLAIM_LIMIT = 20;
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
    if (req.method === 'GET') return res.status(200).json(await loadOnboardingTasks(guard.userId));

    const task = (req.body ?? {}).task;
    if (!isOnboardingTask(task)) return res.status(400).json({ error: 'Geçersiz görev.', code: 'BAD_TASK' });
    const rl = await hitFixedWindowRateLimit(`rewards:claim:${guard.userId}`, CLAIM_LIMIT, CLAIM_WINDOW_MS);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Çok fazla deneme. Biraz sonra tekrar dene.', code: 'RATE_LIMITED' });
    }
    const out = await claimOnboardingTask(guard.userId, task);
    if (out.ok) return res.status(200).json({ ok: true, credits: out.balance });
    return res.status(out.code === 'ALREADY_CLAIMED' ? 409 : out.code === 'UNVERIFIED' ? 403 : 400).json({ error: MESSAGES[out.code], code: out.code });
  } catch (err) {
    captureError('rewards-tasks', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
