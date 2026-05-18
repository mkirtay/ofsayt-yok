import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { getMatchWithEvents } from '@/services/liveScoreService';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { livescoreAxiosFromIncomingMessage } from '@/server/livescoreInternalAxios';

type PollResponse = {
  matchId: string;
  home: number;
  draw: number;
  away: number;
  total: number;
  userPrediction: 'HOME' | 'DRAW' | 'AWAY' | null;
};

const VALID_PREDICTIONS = new Set(['HOME', 'DRAW', 'AWAY']);

function isOpenStatus(status: string): boolean {
  return status === 'NOT STARTED' || status === 'SCHEDULED';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PollResponse | { error: string }>
) {
  const { id } = req.query;
  const matchId = Array.isArray(id) ? id[0] : id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId zorunlu' });
  }

  // ── GET: aggregate votes + user's own vote ──────────────────────────────
  if (req.method === 'GET') {
    const session = await getServerSession(req, res, authOptions);

    const [votes, userRow] = await Promise.all([
      prisma.userPrediction.groupBy({
        by: ['prediction'],
        where: { matchId },
        _count: { prediction: true },
      }),
      session?.user?.id
        ? prisma.userPrediction.findUnique({
            where: { matchId_userId: { matchId, userId: session.user.id } },
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
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    }

    const ip = requestIp(req.headers, req.socket.remoteAddress);
    const rl = await hitFixedWindowRateLimit(`poll:${ip}`, 10, 60_000);
    if (!rl.success) {
      return res.status(429).json({ error: 'Çok fazla istek. Lütfen bekleyin.' });
    }

    const { prediction } = req.body as { prediction?: string };
    if (!prediction || !VALID_PREDICTIONS.has(prediction)) {
      return res.status(400).json({ error: 'Geçersiz tahmin. HOME, DRAW veya AWAY olmalı.' });
    }

    // Match status check — açık olmayan maçlara oy kullanılamaz
    try {
      const axios = livescoreAxiosFromIncomingMessage(req);
      const { match } = await runWithLiveScoreHttpClient(axios, () =>
        getMatchWithEvents(matchId)
      );
      if (!match || !isOpenStatus(match.status)) {
        return res.status(403).json({ error: 'Maç başladı, oylamaya kapalı.' });
      }
    } catch {
      // Servis erişilemezse yine de oylamaya izin verme — güvenli taraf
      return res.status(503).json({ error: 'Maç durumu doğrulanamadı. Lütfen tekrar deneyin.' });
    }

    await prisma.userPrediction.upsert({
      where: { matchId_userId: { matchId, userId: session.user.id } },
      update: { prediction },
      create: { matchId, userId: session.user.id, prediction },
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
