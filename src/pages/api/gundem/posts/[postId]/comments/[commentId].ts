import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { queryString } from '@/lib/gundem/validation';
import { isAdminUser } from '@/lib/gundem/authz';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const postId = queryString(req.query.postId);
  const commentId = queryString(req.query.commentId);
  if (!postId || !commentId) return res.status(400).json({ error: 'Geçersiz istek.' });
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).end();
  }

  try {
    const userId = await getRequestUserId(req, res);
    if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

    const comment = await prisma.postComment.findFirst({
      where: { id: commentId, postId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!comment) return res.status(404).json({ error: 'Yorum bulunamadı veya zaten silinmiş.' });

    if (comment.userId !== userId && !(await isAdminUser(userId))) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    }

    await prisma.postComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date(), deletedByUserId: userId },
    });
    return res.status(204).end();
  } catch (e) {
    captureError('gundem:comment-delete', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
