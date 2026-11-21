/**
 * /api/mini-saha/progress — Mini Saha ilerlemesi (oynayarak açılan karakterler), giriş yapmış kullanıcı için.
 * - GET: { progress }
 * - POST { summary }: biten maçı işler (kurallar lib/miniSaha/progress.ts) → { progress, newlyUnlocked }
 * - POST { merge }: misafirken tarayıcıda birikmiş ilerlemeyi hesaba taşır (birleşim) → { progress }
 * Maç sonucu istemciden gelir (bota karşı tek kişilik oyun; ödül yalnız karakter kilidi, kredi YOK). Kötüye kullanım
 * sınırı: kullanıcı 12/dk, IP 30/dk (Upstash; fail-open) + makul skor aralığı.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { applyMatch, emptyProgress, mergeProgress, parseSummary, sanitizeProgress, type Progress } from '@/lib/miniSaha/progress';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { requireAuth } from '@/lib/requireAuth';

export const PROGRESS_USER_LIMIT = 12;
export const PROGRESS_IP_LIMIT = 30;
const WINDOW_MS = 60_000;

async function load(userId: string): Promise<Progress> {
  const row = await prisma.miniSahaProgress.findUnique({ where: { userId } });
  return row ? sanitizeProgress(row) : emptyProgress();
}

async function save(userId: string, p: Progress): Promise<void> {
  const data = { matches: p.matches, wins: p.wins, unlocked: p.unlocked };
  await prisma.miniSahaProgress.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    if (req.method === 'GET') return res.status(200).json({ progress: await load(guard.userId) });

    const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
    const [byUser, byIp] = await Promise.all([
      hitFixedWindowRateLimit(`mini-saha:user:${guard.userId}`, PROGRESS_USER_LIMIT, WINDOW_MS),
      hitFixedWindowRateLimit(`mini-saha:ip:${ip}`, PROGRESS_IP_LIMIT, WINDOW_MS),
    ]);
    if (!byUser.success || !byIp.success) {
      const resetAt = Math.max(byUser.resetAt, byIp.resetAt);
      res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: 'Çok fazla istek gönderdiniz. Biraz bekleyin.' });
    }

    const body = readJsonBody(req);
    if ('merge' in body) {
      const merged = mergeProgress(await load(guard.userId), sanitizeProgress(body.merge));
      await save(guard.userId, merged);
      return res.status(200).json({ progress: merged });
    }
    const summary = parseSummary(body.summary);
    if (!summary) return res.status(400).json({ error: 'Geçersiz maç verisi.', code: 'BAD_BODY' });
    const { progress, newlyUnlocked } = applyMatch(await load(guard.userId), summary);
    await save(guard.userId, progress);
    return res.status(200).json({ progress, newlyUnlocked });
  } catch (err) {
    captureError('api/mini-saha/progress', err);
    return res.status(500).json({ error: 'İlerleme kaydedilemedi.' });
  }
}
