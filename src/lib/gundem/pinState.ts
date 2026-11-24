/** `GET /api/gundem/pin` yanıtı (izleyiciye göre: engel varsa mesaj gizli, kendi teklifi `isMine`). */
import { prisma } from '@/lib/prisma';
import { hasBlocked } from '@/lib/gundem/blocks';
import { serializeMatchBadge } from '@/lib/gundem/posts';
import { PIN_MAX_BID, PIN_MESSAGE_MAX_LENGTH, currentPinLeader, minimumBid, pinWeekEnd, pinWeekStart } from '@/lib/pinBid';
import type { GundemMatchBadge, GundemPinState } from '@/types/gundem';

export async function loadPinState(viewerId: string | null, now: Date = new Date()): Promise<GundemPinState> {
  const weekStart = pinWeekStart(now);
  const leader = await currentPinLeader(now);
  let message = leader?.message ?? null;
  if (leader && viewerId && viewerId !== leader.userId) {
    const [a, b] = await Promise.all([hasBlocked(viewerId, leader.userId), hasBlocked(leader.userId, viewerId)]);
    if (a || b) message = null;
  }
  // Sabitlenen gönderi bir maça bağlıysa kart da maç rozetini gösterir (akıştaki gönderiyle aynı).
  let match: GundemMatchBadge | null = null;
  if (leader?.postId && message != null) {
    const post = await prisma.post.findUnique({ where: { id: leader.postId }, select: { matchId: true } });
    if (post?.matchId) {
      const snap = await prisma.matchSnapshot.findUnique({ where: { fixtureId: post.matchId } });
      if (snap) {
        const badge = serializeMatchBadge(snap);
        match = { ...badge, startingAt: badge.startingAt.toISOString() };
      }
    }
  }
  return {
    weekStart: weekStart.toISOString(),
    resetsAt: pinWeekEnd(weekStart).toISOString(),
    minBid: minimumBid(leader?.amount),
    maxBid: PIN_MAX_BID,
    messageMaxLength: PIN_MESSAGE_MAX_LENGTH,
    leader: leader
      ? {
          id: leader.id,
          amount: leader.amount,
          since: leader.createdAt.toISOString(),
          message,
          postId: message == null ? null : leader.postId,
          match,
          user: { id: leader.userId, username: leader.user.username, name: leader.user.name, image: leader.user.image },
          isMine: viewerId === leader.userId,
        }
      : null,
  };
}
