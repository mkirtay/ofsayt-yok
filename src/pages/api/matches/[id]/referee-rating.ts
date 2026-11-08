/**
 * Hakem puanlama (maç sonrası, 1–10) — bkz. lib/refereeRating.ts.
 *
 * GET  /api/matches/{id}/referee-rating → { average, count, userScore } (yalnız DB; Sportmonks yok). Kullanıcıya özel
 *      alan olduğu için CDN'de tutulmaz.
 * POST /api/matches/{id}/referee-rating { score } → giriş zorunlu, IP + kullanıcı limitli; maç bitmiş ve süre (başlamadan
 *      7 gün + 3 sa) dolmamış olmalı. Hakem kimliği istemciden ALINMAZ, sunucuda maçtan çözülür. Aynı kullanıcı tek oy
 *      (userId + matchId tekil), tekrar gönderim puanı günceller.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { getRequestUserId } from '@/lib/mobileAuth';
import { isDeletedUserId } from '@/config/deletedUser';
import { parseRefereeScore, type RatingAggregate } from '@/lib/refereeRating';
import { loadMatchRatingAggregate, loadUserMatchRating, resolveRatingTarget, saveRefereeRating } from '@/server/refereeRating';

export type RefereeRatingResponse = RatingAggregate & { userScore: number | null };

export const RATING_IP_LIMIT = 20;
export const RATING_USER_LIMIT = 8;
export const RATING_WINDOW_MS = 60_000;

const ID = /^\d{1,12}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse<RefereeRatingResponse | { error: string; code?: string }>) {
  const raw = req.query.id;
  const matchId = String(Array.isArray(raw) ? raw[0] : (raw ?? ''));
  if (!ID.test(matchId)) return res.status(400).json({ error: 'Geçersiz maç' });

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'private, no-store');
    const userId = await getRequestUserId(req, res);
    const [agg, userScore] = await Promise.all([
      loadMatchRatingAggregate(matchId),
      userId ? loadUserMatchRating(userId, matchId) : Promise.resolve(null),
    ]);
    return res.status(200).json({ ...agg, userScore });
  }

  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'private, no-store');
    const userId = await getRequestUserId(req, res);
    if (!userId || isDeletedUserId(userId)) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.', code: 'AUTH_REQUIRED' });

    const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
    const [ipRl, userRl] = await Promise.all([
      hitFixedWindowRateLimit(`referee-rating:${ip}`, RATING_IP_LIMIT, RATING_WINDOW_MS),
      hitFixedWindowRateLimit(`referee-rating:user:${userId}`, RATING_USER_LIMIT, RATING_WINDOW_MS),
    ]);
    if (!ipRl.success || !userRl.success) return res.status(429).json({ error: 'Çok fazla istek. Lütfen bekleyin.', code: 'RATE_LIMITED' });

    const score = parseRefereeScore(req.body);
    if (score == null) return res.status(400).json({ error: 'Puan 1 ile 10 arasında bir tam sayı olmalı.', code: 'INVALID_SCORE' });

    const target = await resolveRatingTarget(matchId);
    if (!target.ok) {
      if (target.reason === 'unavailable') return res.status(503).json({ error: 'Maç bilgisi alınamadı, tekrar deneyin.', code: 'UNAVAILABLE' });
      if (target.reason === 'missing') return res.status(404).json({ error: 'Maç bulunamadı.', code: 'NOT_FOUND' });
      if (target.reason === 'no-referee') return res.status(409).json({ error: 'Bu maçın hakemi bilinmiyor.', code: 'NO_REFEREE' });
      if (target.reason === 'not-finished') return res.status(409).json({ error: 'Puanlama maç bitince açılır.', code: 'NOT_FINISHED' });
      return res.status(409).json({ error: 'Bu maç için puanlama süresi doldu.', code: 'CLOSED' });
    }

    await saveRefereeRating(userId, matchId, score, target);
    const agg = await loadMatchRatingAggregate(matchId);
    return res.status(200).json({ ...agg, userScore: score });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
