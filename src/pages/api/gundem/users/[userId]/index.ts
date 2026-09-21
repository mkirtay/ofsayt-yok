import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { queryString } from '@/lib/gundem/validation';
import { postAuthorSelect, serializeAuthor } from '@/lib/gundem/posts';

/**
 * GET: profil başlığı — yazar alanları (isim, avatar, takipçi/takip sayısı, followedByMe) + silinmemiş post sayısı + `official`
 * (resmi hesap rozeti). Auth opsiyonel. E-posta yalnızca `official` karşılaştırması için okunur, yanıta yazılmaz.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const targetId = queryString(req.query.userId);
  if (!targetId) return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  try {
    const viewerId = await getRequestUserId(req, res);
    const user = await prisma.user.findUnique({ where: { id: targetId }, select: postAuthorSelect(viewerId) });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const postCount = await prisma.post.count({ where: { authorId: targetId, deletedAt: null } });
    return res.json({ user: { ...serializeAuthor(user, viewerId), postCount } });
  } catch (e) {
    captureError('gundem:user-profile', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
