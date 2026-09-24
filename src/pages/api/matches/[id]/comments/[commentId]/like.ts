/**
 * @deprecated KULLANILMIYOR (2026-09-25): maç forumu artık Gündem postları (`/api/gundem/posts?scope=match&matchId=`).
 * Web bu ucu çağırmıyor; mobil yayına çıkmadan Gündem uçlarına geçiyor. `MatchComment` tablosu salt-okunur kalır, veri
 * taşınmadı. Mobil geçişi tamamlanınca bu uç ayrı bir işte kaldırılacak — yeni kullanım EKLEME.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';

function queryString(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && typeof v === 'string' ? v : null;
}

/** POST: beğeniyi aç/kapat (toggle). Yanıt: `{ liked, likes }`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const matchId = queryString(req.query.id);
  const commentId = queryString(req.query.commentId);
  if (!matchId || !commentId) {
    return res.status(400).json({ error: 'Geçersiz istek.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const userId = await getRequestUserId(req, res);
    if (!userId) {
      return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    }

    const rl = await hitFixedWindowRateLimit(`comment-like:user:${userId}`, 30, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: 'Çok fazla işlem yaptınız. Biraz bekleyin.' });
    }

    const comment = await prisma.matchComment.findFirst({
      where: { id: commentId, matchId, deletedAt: null },
      select: { id: true },
    });
    if (!comment) {
      return res.status(404).json({ error: 'Yorum bulunamadı.' });
    }

    const key = { commentId_userId: { commentId, userId } };
    const existing = await prisma.matchCommentLike.findUnique({ where: key, select: { id: true } });
    if (existing) {
      await prisma.matchCommentLike.deleteMany({ where: { commentId, userId } });
    } else {
      // Çift tıklama yarışında unique ihlali olursa sessizce yut — sonuç zaten "beğenildi".
      await prisma.matchCommentLike.create({ data: { commentId, userId } }).catch(() => undefined);
    }

    const likes = await prisma.matchCommentLike.count({ where: { commentId } });
    return res.json({ liked: !existing, likes });
  } catch (e) {
    captureError('comment-like', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
