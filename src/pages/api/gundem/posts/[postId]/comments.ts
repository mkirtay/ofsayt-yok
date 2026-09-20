import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { withAbsoluteImage } from '@/lib/siteUrl';
import { COMMENT_MAX_LENGTH } from '@/config/gundem';
import { PAGE_SIZE, queryString, readJsonBody } from '@/lib/gundem/validation';
import { authorSelect, paginate } from '@/lib/gundem/posts';
import { createNotification } from '@/lib/gundem/notify';

const commentSelect = {
  id: true,
  postId: true,
  body: true,
  createdAt: true,
  user: { select: authorSelect },
} as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const postId = queryString(req.query.postId);
  if (!postId) return res.status(400).json({ error: 'Geçersiz gönderi kimliği.' });

  try {
    if (req.method === 'GET') {
      const post = await prisma.post.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true } });
      if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' });

      const cursor = queryString(req.query.cursor);
      const rows = await prisma.postComment.findMany({
        where: { postId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: commentSelect,
      });
      const { items, nextCursor } = paginate(rows, PAGE_SIZE);
      return res.json({ items: items.map((c) => ({ ...c, user: withAbsoluteImage(c.user) })), nextCursor });
    }

    if (req.method === 'POST') {
      const userId = await getRequestUserId(req, res);
      if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

      const rl = await hitFixedWindowRateLimit(`gundem-comment:user:${userId}`, 5, 60_000);
      if (!rl.success) {
        res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
        return res.status(429).json({ error: 'Çok fazla yorum gönderdiniz. Biraz bekleyin.' });
      }

      const input = readJsonBody(req);
      const body = sanitizePlainText(typeof input.body === 'string' ? input.body : '', { allowNewlines: true });
      if (!body || body.length > COMMENT_MAX_LENGTH) {
        return res.status(400).json({ error: `Yorum 1–${COMMENT_MAX_LENGTH} karakter olmalıdır.` });
      }

      const post = await prisma.post.findFirst({
        where: { id: postId, deletedAt: null },
        select: { id: true, authorId: true },
      });
      if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' });

      const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });

      const comment = await prisma.postComment.create({ data: { postId, userId, body }, select: commentSelect });
      await createNotification({ userId: post.authorId, actorId: userId, type: 'POST_COMMENT', postId });

      return res.status(201).json({ ...comment, user: withAbsoluteImage(comment.user) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    captureError('gundem:post-comments', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
