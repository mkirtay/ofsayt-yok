import type { Prisma } from '@prisma/client';
import { withAbsoluteImage } from '@/lib/siteUrl';

export const authorSelect = { id: true, name: true, username: true, image: true } as const;

/** Beğeni/yorum sayaçları `_count` ile hesaplanır (silinmiş yorumlar sayılmaz). */
export function postSelect(viewerId: string | null) {
  return {
    id: true,
    body: true,
    createdAt: true,
    authorType: true,
    matchId: true,
    teamId: true,
    author: { select: authorSelect },
    _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
    likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
  } satisfies Prisma.PostSelect;
}

type PostRow = Prisma.PostGetPayload<{ select: ReturnType<typeof postSelect> }>;

export function serializePost(row: PostRow) {
  const { _count, likes, author, ...rest } = row;
  return {
    ...rest,
    author: withAbsoluteImage(author),
    likes: _count.likes,
    comments: _count.comments,
    likedByMe: Array.isArray(likes) && likes.length > 0,
  };
}

/** Cursor sayfalama (take: N+1, cursor + skip: 1) kalıbı — `items`'ın son id'si `nextCursor`. */
export function paginate<T extends { id: string }>(rows: T[], pageSize: number) {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export const feedOrder = [{ createdAt: 'desc' }, { id: 'desc' }] as const satisfies Prisma.PostOrderByWithRelationInput[];
