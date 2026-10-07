/**
 * POST /api/frikik/score — günün koşusunu tabloya yazar. Gövde: { day, seed, simVersion, shots } (vuruş GİRDİLERİ; skor
 * yok). Sunucu günü/tohumu doğrular, koşuyu sim.ts ile yeniden oynatır ve puanı kendisi hesaplar (lib/frikik/scoreSubmit.ts).
 * - 401 giriş yok · 403 NICKNAME_REQUIRED (takma ad yok) · 400 geçersiz gövde / gün / tohum / bitmemiş koşu
 * - 409 SIM_VERSION: istemci eski simülasyonla oynamış (nedeni loglanır)
 * - Aynı kullanıcı + gün için tek kayıt: ikinci gönderim mevcut kaydı döner (recorded=false).
 * Hız sınırı: kullanıcı 6/dk, IP 20/dk (Upstash; fail-open).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseScoreSubmission, verifyRun } from '@/lib/frikik/scoreSubmit';
import { readJsonBody } from '@/lib/gundem/validation';
import { captureError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { requireAuth } from '@/lib/requireAuth';
import { submitVerifiedRun } from '@/server/frikik/leaderboardService';

export const NICKNAME_REQUIRED_CODE = 'NICKNAME_REQUIRED';
export const SCORE_USER_LIMIT = 6;
export const SCORE_IP_LIMIT = 20;
export const SCORE_WINDOW_MS = 60_000;

const REJECT_STATUS: Record<string, number> = { SIM_VERSION: 409 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
  const [byUser, byIp] = await Promise.all([
    hitFixedWindowRateLimit(`frikik-score:user:${guard.userId}`, SCORE_USER_LIMIT, SCORE_WINDOW_MS),
    hitFixedWindowRateLimit(`frikik-score:ip:${ip}`, SCORE_IP_LIMIT, SCORE_WINDOW_MS),
  ]);
  if (!byUser.success || !byIp.success) {
    const resetAt = Math.max(byUser.resetAt, byIp.resetAt);
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Çok fazla istek gönderdiniz. Biraz bekleyin.' });
  }

  const sub = parseScoreSubmission(readJsonBody(req));
  if (!sub) return res.status(400).json({ error: 'Geçersiz koşu verisi.', code: 'BAD_BODY' });
  const verified = verifyRun(sub, Date.now());
  if (!verified.ok) {
    if (verified.code === 'SIM_VERSION') console.warn(`[frikik-score] sürüm uyuşmazlığı: user=${guard.userId} ${verified.detail}`);
    return res.status(REJECT_STATUS[verified.code] ?? 400).json({ error: 'Koşu doğrulanamadı.', code: verified.code });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: guard.userId }, select: { username: true } });
    if (!user) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    if (!user.username) return res.status(403).json({ error: 'Tabloya yazmak için bir takma ad seç.', code: NICKNAME_REQUIRED_CODE });
    const outcome = await submitVerifiedRun(guard.userId, verified);
    return res.status(200).json(outcome);
  } catch (err) {
    captureError('frikik-score', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
