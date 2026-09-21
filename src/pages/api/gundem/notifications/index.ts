import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { PAGE_SIZE, queryString, readJsonBody } from '@/lib/gundem/validation';
import { authorSelect, paginate, serializeUserRef } from '@/lib/gundem/posts';

/**
 * GET: bildirim listesi (cursor). POST: okundu işaretle — gövde `{ ids?: string[] }`;
 * `ids` yoksa kullanıcının tüm okunmamışları okundu olur. Yanıt: `{ updated }`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const guard = await requireAuth(req, res);
      if (!guard.ok) return;
      const { userId } = guard;

      const cursor = queryString(req.query.cursor);
      const rows = await prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          type: true,
          postId: true,
          createdAt: true,
          readAt: true,
          actor: { select: authorSelect },
          post: { select: { id: true, body: true, deletedAt: true } },
        },
      });
      const { items, nextCursor } = paginate(rows, PAGE_SIZE);
      return res.json({
        items: items.map(({ actor, post, ...n }) => ({
          ...n,
          actor: actor ? serializeUserRef(actor) : null,
          post: post && !post.deletedAt ? { id: post.id, body: post.body } : null,
        })),
        nextCursor,
      });
    }

    if (req.method === 'POST') {
      const guard = await requireAuth(req, res);
      if (!guard.ok) return;
      const { userId } = guard;

      const { ids } = readJsonBody(req);
      if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some((i) => typeof i !== 'string'))) {
        return res.status(400).json({ error: 'Geçersiz bildirim listesi.' });
      }

      const result = await prisma.notification.updateMany({
        where: { userId, readAt: null, ...(ids ? { id: { in: ids as string[] } } : {}) },
        data: { readAt: new Date() },
      });
      return res.json({ updated: result.count });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    captureError('gundem:notifications', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
