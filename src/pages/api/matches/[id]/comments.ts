/**
 * @deprecated KULLANILMIYOR (2026-09-25): maç forumu artık Gündem postları (`/api/gundem/posts?scope=match&matchId=`).
 * Web bu ucu çağırmıyor; mobil yayına çıkmadan Gündem uçlarına geçiyor. `MatchComment` tablosu salt-okunur kalır, veri
 * taşınmadı. Mobil geçişi tamamlanınca bu uç ayrı bir işte kaldırılacak — yeni kullanım EKLEME.
 */
import { withAbsoluteImage } from '@/lib/siteUrl';
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';

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

      const viewerId = await getRequestUserId(req, res);
      const baseArgs = {
        where: { matchId, deletedAt: null },
        orderBy: { createdAt: 'desc' as const },
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      };
      const baseSelect = {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { id: true, name: true, image: true } },
      } as const;

      let comments: Array<{
        id: string;
        body: string;
        createdAt: Date;
        user: { id: string; name: string | null; image: string | null };
        likes: number;
        likedByMe: boolean;
      }>;
      try {
        const rows = await prisma.matchComment.findMany({
          ...baseArgs,
          select: {
            ...baseSelect,
            _count: { select: { likes: true } },
            likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
          },
        });
        comments = rows.map(({ _count, likes, ...c }) => ({
          ...c,
          likes: _count.likes,
          likedByMe: Array.isArray(likes) && likes.length > 0,
        }));
      } catch (e) {
        // `MatchCommentLike` tablosu henüz DB'ye uygulanmadıysa (db:push bekliyor) yorumlar beğenisiz de yüklensin.
        captureError('comments:likes-unavailable', e);
        const rows = await prisma.matchComment.findMany({ ...baseArgs, select: baseSelect });
        comments = rows.map((c) => ({ ...c, likes: 0, likedByMe: false }));
      }

      const hasMore = comments.length > PAGE_SIZE;
      // `image` her zaman tam URL (mobil istemci galeri avatarının göreli yolunu çözemez).
      const items = (hasMore ? comments.slice(0, PAGE_SIZE) : comments).map((c) => ({ ...c, user: withAbsoluteImage(c.user) }));

      return res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
    }

    if (req.method === 'POST') {
      const userId = await getRequestUserId(req, res);
      if (!userId) {
        return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
      }

      // Kullanıcı başına dakikada 5 yorum limiti — spam koruması
      const rl = await hitFixedWindowRateLimit(`comments:user:${userId}`, 5, 60_000);
      if (!rl.success) {
        res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
        return res.status(429).json({ error: 'Çok fazla yorum gönderdiniz. Biraz bekleyin.' });
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

      return res.status(201).json({ ...comment, user: withAbsoluteImage(comment.user), likes: 0, likedByMe: false });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    captureError('comments', e);
    return res.status(500).json({
      error: 'Sunucu hatası.',
      ...(process.env.NODE_ENV === 'development' && e instanceof Error
        ? { detail: e.message }
        : {}),
    });
  }
}
