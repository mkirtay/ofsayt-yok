import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { queryString } from '@/lib/gundem/validation';
import { postSelect, serializePost } from '@/lib/gundem/posts';
import { isAdminUser } from '@/lib/gundem/authz';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const postId = queryString(req.query.postId);
  if (!postId) return res.status(400).json({ error: 'Geçersiz gönderi kimliği.' });

  try {
    if (req.method === 'GET') {
      const viewerId = await getRequestUserId(req, res);
      const post = await prisma.post.findFirst({
        where: { id: postId, deletedAt: null },
        select: postSelect(viewerId),
      });
      if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' });
      return res.json(serializePost(post, viewerId));
    }

    if (req.method === 'DELETE') {
      const userId = await getRequestUserId(req, res);
      if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

      const post = await prisma.post.findFirst({
        where: { id: postId, deletedAt: null },
        select: { id: true, authorId: true },
      });
      if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı veya zaten silinmiş.' });

      if (post.authorId !== userId && !(await isAdminUser(userId))) {
        return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
      }

      await prisma.post.update({ where: { id: postId }, data: { deletedAt: new Date(), deletedByUserId: userId } });
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).end();
  } catch (e) {
    captureError('gundem:post', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
