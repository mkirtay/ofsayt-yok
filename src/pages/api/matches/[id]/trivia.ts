/**
 * GET /api/matches/[id]/trivia
 *
 * Giriş yapmış kullanıcılar için LLM tabanlı maç trivia üretir.
 * v2 (2026-10): maç başına TEK üretim — yalnız bağlamdaki veriye dayandığı için fazla (PRE/HT/POST) yenilenmez.
 * Kayıtlı v2 trivia varsa maç bağlamı hiç kurulmadan döner. Eski (v1, genel bilgiye dayanan) kayıt varsa bir kez
 * v2 ile değiştirilir.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { generateMatchTrivia, TriviaTimeoutError } from '@/services/aiTriviaService';
import { TRIVIA_MODEL_VERSION } from '@/config/triviaPrompt';
import { captureError } from '@/lib/logger';

/** Bu sürümle (ya da sonrasıyla aynı önekle) üretilmiş kayıt yeniden üretilmez. */
const isCurrentTrivia = (modelVersion: string) => modelVersion.startsWith(TRIVIA_MODEL_VERSION);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const guard = await requireAuth(req, res);
  if (!guard.ok) return;

  const rl = await hitFixedWindowRateLimit(`trivia:${guard.userId}`, 20, 60 * 60 * 1000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Saatlik trivia limitine ulaştınız. Lütfen bekleyin.' });
  }

  const { id } = req.query;
  const matchId = Array.isArray(id) ? id[0] : id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId zorunlu' });
  }

  try {

    const result = await (async () => {
      // Tek üretim: bu maç için güncel sürüm trivia varsa (hangi fazda üretilmiş olursa olsun) bağlam kurulmaz.
      const latest = await prisma.matchTrivia.findFirst({ where: { matchId }, orderBy: { createdAt: 'desc' } });
      if (latest && isCurrentTrivia(latest.modelVersion)) {
        return { status: 200 as const, body: { trivia: latest, cached: true } };
      }

      const ctx = await buildMatchAnalysisContext(matchId);
      if (!ctx) {
        return { status: 404 as const, body: { error: 'Maç bulunamadı' } };
      }

      if (ctx.archived) {
        // Canlı sağlayıcıda maç yok; hangi matchStatus'ta saklandığı da bilinmiyor
        // (bu bilgi live match status'e bağlıydı) — matchId için en son kaydı al.
        // Canlı context olmadığı için yeniden üretim mümkün değil; expiresAt
        // tazelik kontrolü de bu yüzden uygulanmıyor, elde ne varsa o gösterilir.
        const existing = await prisma.matchTrivia.findFirst({
          where: { matchId },
          orderBy: { createdAt: 'desc' },
        });
        if (!existing) {
          return { status: 404 as const, body: { error: 'Bu maç için trivia üretilmedi.' } };
        }
        return { status: 200 as const, body: { trivia: existing, cached: true, isArchived: true } };
      }

      // Eski sürüm kayıt (varsa) yerinde güncellenir; yoksa yeni satır. v2 kayıtların süresi dolmaz.
      const existing = latest;
      const now = new Date();
      const ai = await generateMatchTrivia(ctx);
      const expiresAt = null;

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
    })();

    return res.status(result.status).json(result.body);
  } catch (err) {
    captureError('trivia', err);
    if (err instanceof TriviaTimeoutError) {
      return res.status(504).json({ error: err.message });
    }
    const detail = process.env.NODE_ENV === 'development'
      ? (err instanceof Error ? err.message : String(err))
      : undefined;
    return res.status(500).json({ error: 'Trivia üretilemedi. Lütfen tekrar deneyin.', detail });
  }
}
