import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { isDeletedUserId } from '@/config/deletedUser';

export type NotificationType = 'POST_LIKE' | 'POST_COMMENT' | 'FOLLOW' | 'OFFICIAL_POST' | 'MENTION';

type NotifyInput = { userId: string; actorId: string; type: NotificationType; postId?: string | null };

/** Yönetici uyarısı (aktörsüz; şikâyet eden / yönetici kimliği yok). Mobil bilinmeyen türü atlar. */
export async function createModerationWarning(userId: string): Promise<void> {
  if (isDeletedUserId(userId)) return;
  try {
    await prisma.notification.create({ data: { userId, actorId: null, type: 'MODERATION_WARNING' } });
  } catch (e) {
    captureError('gundem:notify-warning', e);
  }
}

/**
 * Bildirim satırı yazar. Kendine bildirim oluşturulmaz; alıcı aktörü engellediyse yazılmaz (engellenen, engelleyene
 * bildirim üretemez — ve bunu fark etmez). Bildirim hatası ana işlemi (beğeni/yorum/takip) bozmaz.
 * `dedupe`: aynı (alıcı, aktör, tür, post) için zaten kayıt varsa yenisini yazmaz (beğen/geri al/beğen spam'ini önler).
 */
export async function createNotification(input: NotifyInput, opts: { dedupe?: boolean } = {}): Promise<void> {
  // Kendine bildirim yok; silinmiş kullanıcı yer tutucusuna (anonimleştirilmiş gönderiler) bildirim yazılmaz.
  if (input.userId === input.actorId || isDeletedUserId(input.userId)) return;
  try {
    const postId = input.postId ?? null;
    const blocked = await prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: input.userId, blockedId: input.actorId } },
      select: { id: true },
    });
    if (blocked) return;
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
