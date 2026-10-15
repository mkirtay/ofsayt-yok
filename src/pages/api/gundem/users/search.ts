import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { requireAuth } from '@/lib/requireAuth';
import { queryString } from '@/lib/gundem/validation';
import { DELETED_USER_ID } from '@/config/deletedUser';
import { withAbsoluteImage } from '@/lib/siteUrl';

const LIMIT = 8;

/**
 * GET `?q=<önek>`: @etiket önerisi — kullanıcı adı öneke uyan (büyük/küçük harf duyarsız), silinmemiş, iki yönde de engel
 * olmayan kullanıcılar (kendisi hariç), en fazla 8. Giriş zorunlu (kullanıcı listesi kazınmasın) + hız sınırı.
 * Yanıt `{ items: [{ id, username, name, image }] }`; e-posta yok.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    const guard = await requireAuth(req, res);
    if (!guard.ok) return;
    const q = (queryString(req.query.q) ?? '').replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_]{1,30}$/.test(q)) return res.json({ items: [] });
    const rl = await hitFixedWindowRateLimit(`gundem-user-search:user:${guard.userId}`, 60, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
      return res.status(429).json({ error: 'Çok fazla istek. Biraz bekleyin.' });
    }
    const viewerId = guard.userId;
    const users = await prisma.user.findMany({
      where: {
        username: { startsWith: q, mode: 'insensitive' },
        id: { notIn: [DELETED_USER_ID, viewerId] },
        blockedBy: { none: { blockerId: viewerId } },
        blocksMade: { none: { blockedId: viewerId } },
      },
      orderBy: { username: 'asc' },
      take: LIMIT,
      select: { id: true, username: true, name: true, image: true },
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ items: users.map((u) => withAbsoluteImage(u)) });
  } catch (e) {
    captureError('gundem:user-search', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
