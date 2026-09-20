import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { PAGE_SIZE, queryString } from '@/lib/gundem/validation';
import { feedOrder, paginate, postSelect, serializePost } from '@/lib/gundem/posts';

/** GET: kullanıcının profil akışı (silinmemiş postları, yeniden eskiye, cursor sayfalama). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const targetId = queryString(req.query.userId);
  if (!targetId) return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const cursor = queryString(req.query.cursor);
    const viewerId = await getRequestUserId(req, res);
    const rows = await prisma.post.findMany({
      where: { authorId: targetId, deletedAt: null },
      orderBy: [...feedOrder],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: postSelect(viewerId),
    });
    const { items, nextCursor } = paginate(rows, PAGE_SIZE);
    return res.json({ items: items.map((p) => serializePost(p, viewerId)), nextCursor });
  } catch (e) {
    captureError('gundem:user-posts', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
