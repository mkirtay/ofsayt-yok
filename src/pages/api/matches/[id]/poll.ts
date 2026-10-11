import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { getRequestUserId } from '@/lib/mobileAuth';
import { resolvePollLock } from '@/server/matchPollLock';

type PollResponse = {
  matchId: string;
  home: number;
  draw: number;
  away: number;
  total: number;
  userPrediction: 'HOME' | 'DRAW' | 'AWAY' | null;
};

const VALID_PREDICTIONS = new Set(['HOME', 'DRAW', 'AWAY']);

/** IP başına (paylaşımlı ağlar için gevşek) ve kullanıcı başına (IP değiştiren tek hesap) ayrı sabit pencereler. */
export const POLL_IP_LIMIT = 10;
export const POLL_USER_LIMIT = 6;
export const POLL_WINDOW_MS = 60_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PollResponse | { error: string; code?: string }>
) {
  const { id } = req.query;
  const matchId = Array.isArray(id) ? id[0] : id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId zorunlu' });
  }

  // ── GET: aggregate votes + user's own vote ──────────────────────────────
  if (req.method === 'GET') {
    const userId = await getRequestUserId(req, res);

    const [votes, userRow] = await Promise.all([
      prisma.userPrediction.groupBy({
        by: ['prediction'],
        where: { matchId },
        _count: { prediction: true },
      }),
      userId
        ? prisma.userPrediction.findUnique({
            where: { matchId_userId: { matchId, userId } },
            select: { prediction: true },
          })
        : Promise.resolve(null),
    ]);

    const counts = { HOME: 0, DRAW: 0, AWAY: 0 };
    for (const row of votes) {
      const key = row.prediction as keyof typeof counts;
      if (key in counts) counts[key] = row._count.prediction;
    }

    return res.status(200).json({
      matchId,
      home: counts.HOME,
      draw: counts.DRAW,
      away: counts.AWAY,
      total: counts.HOME + counts.DRAW + counts.AWAY,
      userPrediction: (userRow?.prediction ?? null) as PollResponse['userPrediction'],
    });
  }

  // ── POST: submit or update vote ─────────────────────────────────────────
  if (req.method === 'POST') {
    const userId = await getRequestUserId(req, res);
    if (!userId) {
      return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    }

    const ip = requestIp(req.headers, req.socket.remoteAddress);
    const [ipRl, userRl] = await Promise.all([
      hitFixedWindowRateLimit(`poll:${ip}`, POLL_IP_LIMIT, POLL_WINDOW_MS),
      hitFixedWindowRateLimit(`poll:user:${userId}`, POLL_USER_LIMIT, POLL_WINDOW_MS),
    ]);
    if (!ipRl.success || !userRl.success) {
      return res.status(429).json({ error: 'Çok fazla istek. Lütfen bekleyin.', code: 'RATE_LIMITED' });
    }

    const { prediction } = req.body as { prediction?: string };
    if (!prediction || !VALID_PREDICTIONS.has(prediction)) {
      return res.status(400).json({ error: 'Geçersiz tahmin. HOME, DRAW veya AWAY olmalı.' });
    }

    // Başlama düdüğünden sonra oy verilemez / değiştirilemez (bkz. server/matchPollLock.ts).
    const lock = await resolvePollLock(matchId);
    if (lock.locked) {
      return res.status(409).json({ error: 'Maç başladı, tahminler kapandı.', code: 'LOCKED' });
    }

    await prisma.userPrediction.upsert({
      where: { matchId_userId: { matchId, userId } },
      update: { prediction },
      create: { matchId, userId, prediction },
    });

    // Updated counts
    const votes = await prisma.userPrediction.groupBy({
      by: ['prediction'],
      where: { matchId },
      _count: { prediction: true },
    });

    const counts = { HOME: 0, DRAW: 0, AWAY: 0 };
    for (const row of votes) {
      const key = row.prediction as keyof typeof counts;
      if (key in counts) counts[key] = row._count.prediction;
    }

    return res.status(200).json({
      matchId,
      home: counts.HOME,
      draw: counts.DRAW,
      away: counts.AWAY,
      total: counts.HOME + counts.DRAW + counts.AWAY,
      userPrediction: prediction as PollResponse['userPrediction'],
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
