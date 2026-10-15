/**
 * @etiketleme: metin düz "@kullaniciadi" olarak saklanır (mobil aynı metni görür). Yazma anında sunucu etiketleri çözer:
 * var olan, silinmemiş, iki yönde de engel olmayan kullanıcılar (metindeki sırayla en fazla MAX_MENTIONS) GundemMention
 * satırı olur → yanıtta `mentions` alanı (bağlantı) ve bildirim. Diğerleri düz metin kalır.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MAX_MENTIONS } from '@/config/moderation';
import { DELETED_USER_ID } from '@/config/deletedUser';
import { createNotification } from '@/lib/gundem/notify';
import { extractMentionHandles } from '@/utils/mentions';

export { extractMentionHandles };

export type ResolvedMention = { userId: string; username: string };

/**
 * Etiketleri kullanıcılara çözer (tek sorgu). Var olmayan / silinmiş / engelli (iki yön) etiket düz metin kalır.
 * Kendini etiketleme bağlantı olur ama bildirim üretmez (notifyMentions).
 */
export async function resolveMentions(authorId: string, body: string): Promise<ResolvedMention[]> {
  const handles = extractMentionHandles(body).slice(0, MAX_MENTIONS * 3);
  if (!handles.length) return [];
  const users = await prisma.user.findMany({
    where: {
      OR: handles.map((h) => ({ username: { equals: h, mode: 'insensitive' as const } })),
      id: { not: DELETED_USER_ID },
      blockedBy: { none: { blockerId: authorId } },
      blocksMade: { none: { blockedId: authorId } },
    },
    select: { id: true, username: true },
  });
  const byHandle = new Map(users.filter((u) => u.username).map((u) => [u.username!.toLowerCase(), u.id]));
  const out: ResolvedMention[] = [];
  for (const h of handles) {
    const id = byHandle.get(h);
    if (id && out.length < MAX_MENTIONS) out.push({ userId: id, username: h });
  }
  return out;
}

type MentionTarget = { postId: string; commentId?: string | null };

export function mentionTargetKey(t: MentionTarget): string {
  return t.commentId ? `comment:${t.commentId}` : `post:${t.postId}`;
}

export async function saveMentions(target: MentionTarget, mentions: readonly ResolvedMention[]): Promise<void> {
  if (!mentions.length) return;
  const targetKey = mentionTargetKey(target);
  await prisma.gundemMention.createMany({
    data: mentions.map((m) => ({
      targetKey,
      postId: target.commentId ? null : target.postId,
      commentId: target.commentId ?? null,
      mentionedUserId: m.userId,
      username: m.username,
    })),
    skipDuplicates: true,
  });
}

/** Etiketlenenlere bildirim: kendine yok, engelde yok (createNotification), aynı gönderi için tekrar yok (dedupe). */
export async function notifyMentions(actorId: string, postId: string, mentions: readonly ResolvedMention[]): Promise<void> {
  for (const m of mentions) {
    await createNotification({ userId: m.userId, actorId, type: 'MENTION', postId }, { dedupe: true });
  }
}

/** Post / yorum select'ine eklenecek ilişki. */
export const mentionsSelect = {
  select: { username: true, mentionedUserId: true },
} satisfies Prisma.Post$mentionsArgs;

export function serializeMentions(rows: readonly { username: string; mentionedUserId: string }[] | undefined) {
  return (rows ?? []).map((r) => ({ username: r.username, userId: r.mentionedUserId }));
}
