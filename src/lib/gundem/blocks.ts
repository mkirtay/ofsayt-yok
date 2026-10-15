/**
 * Kullanıcı engelleme. Engelleyen (blocker), engellenenin (blocked) içeriğini ve bildirimlerini görmez; engellenen
 * engelleyeni etiketleyemez ve ona bildirim üretemez. Engelleme iki yöndeki takibi de kaldırır. Engellenen kişiye hiçbir
 * yanıtta söylenmez (profil / akış / hata kodları aynı kalır).
 */
import { prisma } from '@/lib/prisma';
import { isDeletedUserId } from '@/config/deletedUser';
import { isOfficialUser } from '@/lib/gundem/official';

export type BlockResult = { ok: true; blocked: boolean } | { ok: false; status: number; code: string; error: string };

export async function hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const row = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { id: true },
  });
  return row !== null;
}

/** Engelle (idempotent). Kendini, silinmiş kullanıcı yer tutucusunu ve resmi hesabı engelleme yok. */
export async function blockUser(blockerId: string, targetId: string): Promise<BlockResult> {
  if (blockerId === targetId) return { ok: false, status: 400, code: 'CANNOT_BLOCK_SELF', error: 'Kendini engelleyemezsin.' };
  if (isDeletedUserId(targetId)) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Kullanıcı bulunamadı.' };
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, email: true } });
  if (!target) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Kullanıcı bulunamadı.' };
  if (isOfficialUser({ email: target.email })) {
    return { ok: false, status: 400, code: 'CANNOT_BLOCK', error: 'Resmi hesap engellenemez.' };
  }
  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId: targetId } },
      create: { blockerId, blockedId: targetId },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: targetId },
          { followerId: targetId, followingId: blockerId },
        ],
      },
    }),
  ]);
  return { ok: true, blocked: true };
}

/** Engeli kaldır (idempotent). */
export async function unblockUser(blockerId: string, targetId: string): Promise<BlockResult> {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId: targetId } });
  return { ok: true, blocked: false };
}
