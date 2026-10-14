import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { isDeletedUserId } from '@/config/deletedUser';

export type NotificationType = 'POST_LIKE' | 'POST_COMMENT' | 'FOLLOW' | 'OFFICIAL_POST';

type NotifyInput = { userId: string; actorId: string; type: NotificationType; postId?: string | null };

/**
 * Bildirim satırı yazar. Kendine bildirim oluşturulmaz. Bildirim hatası ana işlemi (beğeni/yorum/takip) bozmaz.
 * `dedupe`: aynı (alıcı, aktör, tür, post) için zaten kayıt varsa yenisini yazmaz (beğen/geri al/beğen spam'ini önler).
 */
export async function createNotification(input: NotifyInput, opts: { dedupe?: boolean } = {}): Promise<void> {
  // Kendine bildirim yok; silinmiş kullanıcı yer tutucusuna (anonimleştirilmiş gönderiler) bildirim yazılmaz.
  if (input.userId === input.actorId || isDeletedUserId(input.userId)) return;
  try {
    const postId = input.postId ?? null;
    if (opts.dedupe) {
      const existing = await prisma.notification.findFirst({
        where: { userId: input.userId, actorId: input.actorId, type: input.type, postId },
        select: { id: true },
      });
      if (existing) return;
    }
    await prisma.notification.create({
      data: { userId: input.userId, actorId: input.actorId, type: input.type, postId },
    });
  } catch (e) {
    captureError('gundem:notify', e);
  }
}
