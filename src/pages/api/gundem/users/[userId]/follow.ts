import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { queryString } from '@/lib/gundem/validation';
import { createNotification } from '@/lib/gundem/notify';

/** POST: takibi aç/kapat (toggle). Yanıt: `{ following, followers }` (hedef kullanıcının takipçi sayısı). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const targetId = queryString(req.query.userId);
  if (!targetId) return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const userId = await getRequestUserId(req, res);
    if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

    if (targetId === userId) {
      return res.status(400).json({ error: 'Kendinizi takip edemezsiniz.' });
    }

    const rl = await hitFixedWindowRateLimit(`gundem-follow:user:${userId}`, 30, 60_000);
    if (!rl.success) {
      res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: 'Çok fazla işlem yaptınız. Biraz bekleyin.' });
    }

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.follow.deleteMany({ where: { followerId: userId, followingId: targetId } });
    } else {
      await prisma.follow.create({ data: { followerId: userId, followingId: targetId } }).catch(() => undefined);
      await createNotification({ userId: targetId, actorId: userId, type: 'FOLLOW' }, { dedupe: true });
    }

    const followers = await prisma.follow.count({ where: { followingId: targetId } });
    return res.json({ following: !existing, followers });
  } catch (e) {
    captureError('gundem:follow', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
