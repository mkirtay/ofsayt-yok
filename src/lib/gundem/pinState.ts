/** `GET /api/gundem/pin` yanıtı (izleyiciye göre: engel varsa mesaj gizli, kendi teklifi `isMine`). */
import { hasBlocked } from '@/lib/gundem/blocks';
import { PIN_MAX_BID, PIN_MESSAGE_MAX_LENGTH, currentPinLeader, minimumBid, pinWeekEnd, pinWeekStart } from '@/lib/pinBid';
import type { GundemPinState } from '@/types/gundem';

export async function loadPinState(viewerId: string | null, now: Date = new Date()): Promise<GundemPinState> {
  const weekStart = pinWeekStart(now);
  const leader = await currentPinLeader(now);
  let message = leader?.message ?? null;
  if (leader && viewerId && viewerId !== leader.userId) {
    const [a, b] = await Promise.all([hasBlocked(viewerId, leader.userId), hasBlocked(leader.userId, viewerId)]);
    if (a || b) message = null;
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
          user: { id: leader.userId, username: leader.user.username, name: leader.user.name, image: leader.user.image },
          isMine: viewerId === leader.userId,
        }
      : null,
  };
}
