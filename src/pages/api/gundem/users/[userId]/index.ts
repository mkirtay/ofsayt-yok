import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { isDeletedUserId } from '@/config/deletedUser';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { queryString } from '@/lib/gundem/validation';
import { postAuthorSelect, serializeAuthor } from '@/lib/gundem/posts';
import { hasBlocked } from '@/lib/gundem/blocks';

/**
 * GET: profil başlığı — yazar alanları (isim, avatar, takipçi/takip sayısı, followedByMe) + silinmemiş post sayısı + `official`
 * (resmi hesap rozeti). Auth opsiyonel. E-posta yalnızca `official` karşılaştırması için okunur, yanıta yazılmaz.
 * `blockedByMe` (isteğe bağlı alan): oturum varsa izleyici bu kullanıcıyı engellemiş mi. Ters yön hiçbir yanıtta yok.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const targetId = queryString(req.query.userId);
  if (!targetId) return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
  // Silinmiş kullanıcı yer tutucusunun profili yok (anonimleştirilmiş içerik gruplanmasın — config/deletedUser.ts).
  if (isDeletedUserId(targetId)) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  try {
    const viewerId = await getRequestUserId(req, res);
    const user = await prisma.user.findUnique({ where: { id: targetId }, select: postAuthorSelect(viewerId) });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    const postCount = await prisma.post.count({ where: { authorId: targetId, deletedAt: null, hiddenAt: null } });
    const blockedByMe = viewerId && viewerId !== targetId ? await hasBlocked(viewerId, targetId) : false;
    return res.json({ user: { ...serializeAuthor(user, viewerId), postCount, blockedByMe } });
  } catch (e) {
    captureError('gundem:user-profile', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
