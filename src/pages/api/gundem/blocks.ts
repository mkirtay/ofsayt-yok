import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { PAGE_SIZE, queryString } from '@/lib/gundem/validation';
import { authorSelect, paginate, serializeUserRef } from '@/lib/gundem/posts';

/** GET: engellediğim kullanıcılar (ayarlar listesi) — `{ items: [{ user, blockedAt }], nextCursor }`, yeniden eskiye. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    const guard = await requireAuth(req, res);
    if (!guard.ok) return;
    const cursor = queryString(req.query.cursor);
    const rows = await prisma.userBlock.findMany({
      where: { blockerId: guard.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, createdAt: true, blocked: { select: authorSelect } },
    });
    const { items, nextCursor } = paginate(rows, PAGE_SIZE);
    return res.json({
      items: items.map((r) => ({ user: serializeUserRef(r.blocked), blockedAt: r.createdAt })),
      nextCursor,
    });
  } catch (e) {
    captureError('gundem:blocks', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
