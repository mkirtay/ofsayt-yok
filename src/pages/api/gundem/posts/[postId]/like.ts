import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { queryString } from '@/lib/gundem/validation';
import { createNotification } from '@/lib/gundem/notify';

/** POST: beğeniyi aç/kapat (toggle). Yanıt: `{ liked, likes }`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const postId = queryString(req.query.postId);
  if (!postId) return res.status(400).json({ error: 'Geçersiz istek.' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const userId = await getRequestUserId(req, res);
    if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

    const rl = await hitFixedWindowRateLimit(`gundem-like:user:${userId}`, 30, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: 'Çok fazla işlem yaptınız. Biraz bekleyin.' });
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' });

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.postLike.deleteMany({ where: { postId, userId } });
    } else {
      // Çift tıklama yarışında unique ihlali olursa sessizce yut — sonuç zaten "beğenildi".
      await prisma.postLike.create({ data: { postId, userId } }).catch(() => undefined);
      await createNotification(
        { userId: post.authorId, actorId: userId, type: 'POST_LIKE', postId },
        { dedupe: true },
      );
    }

    const likes = await prisma.postLike.count({ where: { postId } });
    return res.json({ liked: !existing, likes });
  } catch (e) {
    captureError('gundem:post-like', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
