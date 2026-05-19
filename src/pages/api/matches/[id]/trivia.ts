/**
 * GET /api/matches/[id]/trivia
 *
 * Premium kullanıcılar için LLM tabanlı maç trivia üretir.
 * Cache: (matchId, matchStatus) bazlı. PRE fazında 2 saat TTL,
 * HT/POST için süresiz (faz değiştiğinde yeni satır oluşur).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePremium } from '@/lib/requirePremium';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { livescoreAxiosFromIncomingMessage } from '@/server/livescoreInternalAxios';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { generateMatchTrivia, TriviaTimeoutError } from '@/services/aiTriviaService';

const PRE_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await requirePremium(req, res);
  if (!guard.ok) return;

  const { id } = req.query;
  const matchId = Array.isArray(id) ? id[0] : id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId zorunlu' });
  }

  try {
    const axios = livescoreAxiosFromIncomingMessage(req);

    const result = await runWithLiveScoreHttpClient(axios, async () => {
      const ctx = await buildMatchAnalysisContext(matchId);
      if (!ctx) {
        return { status: 404 as const, body: { error: 'Maç bulunamadı' } };
      }

      const existing = await prisma.matchTrivia.findUnique({
        where: { matchId_matchStatus: { matchId, matchStatus: ctx.matchPhase } },
      });
      const now = new Date();
      if (existing) {
        const stillValid = existing.expiresAt == null || existing.expiresAt > now;
        if (stillValid) {
          return { status: 200 as const, body: { trivia: existing, cached: true } };
        }
      }

      const ai = await generateMatchTrivia(ctx);
      const expiresAt =
        ctx.matchPhase === 'PRE' ? new Date(now.getTime() + PRE_TTL_MS) : null;

      const saved = existing
        ? await prisma.matchTrivia.update({
            where: { id: existing.id },
            data: {
              ertemFacts: ai.trivia.ertemFacts as unknown as Prisma.InputJsonValue,
              contextual: ai.trivia.contextual,
              rivalryContext: ai.trivia.rivalryContext,
              modelVersion: ai.modelVersion,
              tokensUsed: ai.tokensUsed,
              expiresAt,
              updatedAt: now,
            },
          })
        : await prisma.matchTrivia.create({
            data: {
              matchId,
              matchStatus: ctx.matchPhase,
              ertemFacts: ai.trivia.ertemFacts as unknown as Prisma.InputJsonValue,
              contextual: ai.trivia.contextual,
              rivalryContext: ai.trivia.rivalryContext,
              modelVersion: ai.modelVersion,
              tokensUsed: ai.tokensUsed,
              expiresAt,
            },
          });

      return { status: 200 as const, body: { trivia: saved, cached: false } };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[trivia] hata:', err);
    if (err instanceof TriviaTimeoutError) {
      return res.status(504).json({ error: err.message });
    }
    const detail = process.env.NODE_ENV === 'development'
      ? (err instanceof Error ? err.message : String(err))
      : undefined;
    return res.status(500).json({ error: 'Trivia üretilemedi. Lütfen tekrar deneyin.', detail });
  }
}
