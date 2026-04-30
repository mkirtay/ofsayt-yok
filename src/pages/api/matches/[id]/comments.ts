import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';

const MAX_BODY_LENGTH = 500;
const PAGE_SIZE = 30;

function matchIdFromQuery(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && typeof id === 'string' ? id : null;
}

function commentBodyFromRequest(req: NextApiRequest): string {
  const b = req.body;
  if (b == null) return '';
  if (typeof b === 'string') {
    try {
      const parsed = JSON.parse(b) as { body?: unknown };
      return String(parsed.body ?? '').trim();
    } catch {
      return '';
    }
  }
  if (typeof b === 'object' && 'body' in b) {
    return String((b as { body?: unknown }).body ?? '').trim();
  }
  return '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const matchId = matchIdFromQuery(req);
  if (!matchId) {
    return res.status(400).json({ error: 'Geçersiz maç kimliği.' });
  }

  try {
    if (req.method === 'GET') {
      const cursor = req.query.cursor as string | undefined;

      const comments = await prisma.matchComment.findMany({
        where: { matchId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: { select: { id: true, name: true, image: true } },
        },
      });

      const hasMore = comments.length > PAGE_SIZE;
      const items = hasMore ? comments.slice(0, PAGE_SIZE) : comments;

      return res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
    }

    if (req.method === 'POST') {
      const session = await getServerSession(req, res, authOptions);
      const userId = session?.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
      }

      const body = sanitizePlainText(commentBodyFromRequest(req));
      if (!body || body.length > MAX_BODY_LENGTH) {
        return res.status(400).json({ error: `Yorum 1–${MAX_BODY_LENGTH} karakter olmalıdır.` });
      }

      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!userExists) {
        return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });
      }

      const comment = await prisma.matchComment.create({
        data: { matchId, body, userId },
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: { select: { id: true, name: true, image: true } },
        },
      });

      return res.status(201).json(comment);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    console.error('[comments]', e);
    return res.status(500).json({
      error: 'Sunucu hatası.',
      ...(process.env.NODE_ENV === 'development' && e instanceof Error
        ? { detail: e.message }
        : {}),
    });
  }
}
