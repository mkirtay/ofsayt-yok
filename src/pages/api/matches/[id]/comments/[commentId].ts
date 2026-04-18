import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { Role } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

function matchIdFromQuery(req: NextApiRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && typeof id === 'string' ? id : null;
}

function commentIdFromQuery(req: NextApiRequest): string | null {
  const raw = req.query.commentId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && typeof id === 'string' ? id : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const matchId = matchIdFromQuery(req);
  const commentId = commentIdFromQuery(req);
  if (!matchId || !commentId) {
    return res.status(400).json({ error: 'Geçersiz istek.' });
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).end();
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
    }
    if (session.user.role !== Role.ADMIN) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    }

    const existing = await prisma.matchComment.findFirst({
      where: { id: commentId, matchId, deletedAt: null },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Yorum bulunamadı veya zaten silinmiş.' });
    }

    await prisma.matchComment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: session.user.id,
      },
    });

    return res.status(204).end();
  } catch (e) {
    console.error('[comments delete]', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
