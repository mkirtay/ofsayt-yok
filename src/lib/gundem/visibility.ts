/**
 * Gündem görünürlük kuralları — akış, profil, gönderi detayı ve yorum sorgularına TEK `where` parçası olarak eklenir
 * (SQL'de NOT EXISTS alt sorgusu; satır başına ek sorgu yok → N+1 yok). Web ve mobil aynı uçları kullandığı için kural
 * sunucuda; istemciye güvenilmez.
 *
 *  - Moderasyonla gizlenen içerik (hiddenAt): yalnız yazarı görür ("inceleme altında" notuyla).
 *  - Engel: izleyicinin engellediği kullanıcının gönderi / yorumu izleyiciye dönmez. Ters yön (beni engelleyen) SÜZÜLMEZ:
 *    engellenen kişiye engellendiği belli edilmez (ürün kararı; docs/WEB_CHANGES_FOR_MOBILE §24 önerisinden farkı rapor).
 */
import type { Prisma } from '@prisma/client';

/** Yazarı izleyicinin engellemediği kullanıcı (User ilişki süzgeci). */
export function notBlockedByViewer(viewerId: string): Prisma.UserWhereInput {
  return { blockedBy: { none: { blockerId: viewerId } } };
}

export function postVisibilityWhere(viewerId: string | null): Prisma.PostWhereInput {
  if (!viewerId) return { hiddenAt: null };
  return {
    AND: [{ OR: [{ hiddenAt: null }, { authorId: viewerId }] }, { author: notBlockedByViewer(viewerId) }],
  };
}

export function commentVisibilityWhere(viewerId: string | null): Prisma.PostCommentWhereInput {
  if (!viewerId) return { hiddenAt: null };
  return {
    AND: [{ OR: [{ hiddenAt: null }, { userId: viewerId }] }, { user: notBlockedByViewer(viewerId) }],
  };
}

/** Bildirimler: engellediğim aktörün (eski) bildirimleri listede ve okunmamış sayısında görünmez. Aktörsüzler kalır. */
export function notificationVisibilityWhere(viewerId: string): Prisma.NotificationWhereInput {
  return { OR: [{ actorId: null }, { actor: notBlockedByViewer(viewerId) }] };
}
