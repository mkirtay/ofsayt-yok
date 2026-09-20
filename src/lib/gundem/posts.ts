import type { Prisma } from '@prisma/client';
import { withAbsoluteImage } from '@/lib/siteUrl';

export const authorSelect = { id: true, name: true, username: true, image: true } as const;

/**
 * Post yazarı: temel alanlar + takipçi/takip sayıları (`Follow` `_count`) + istek sahibinin bu yazarı takip edip etmediği.
 * (`followedByMe` yalnızca oturum varsa sorgulanır; kendi postunda serileştirmede her zaman false'a çevrilir.)
 */
export function postAuthorSelect(viewerId: string | null) {
  return {
    ...authorSelect,
    _count: { select: { followers: true, following: true } },
    followers: viewerId ? { where: { followerId: viewerId }, select: { id: true } } : false,
  } satisfies Prisma.UserSelect;
}

/** Beğeni/yorum sayaçları `_count` ile hesaplanır (silinmiş yorumlar sayılmaz). */
export function postSelect(viewerId: string | null) {
  return {
    id: true,
    body: true,
    createdAt: true,
    authorType: true,
    matchId: true,
    teamId: true,
    author: { select: postAuthorSelect(viewerId) },
    _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
    likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
  } satisfies Prisma.PostSelect;
}

type AuthorRow = Prisma.UserGetPayload<{ select: ReturnType<typeof postAuthorSelect> }>;
type PostRow = Prisma.PostGetPayload<{ select: ReturnType<typeof postSelect> }>;

/** Yazar/profil serileştirmesi (post içindeki `author` ile profil endpoint'i aynısını kullanır). Kendi hesabında `followedByMe` her zaman false. */
export function serializeAuthor(row: AuthorRow, viewerId: string | null = null) {
  const { _count, followers, ...base } = row;
  const viewerFollows = Array.isArray(followers) && followers.length > 0;
  return {
    ...withAbsoluteImage(base),
    followedByMe: viewerFollows && base.id !== viewerId,
    followerCount: _count.followers,
    followingCount: _count.following,
  };
}

export function serializePost(row: PostRow, viewerId: string | null = null) {
  const { _count, likes, author, ...rest } = row;
  return {
    ...rest,
    author: serializeAuthor(author, viewerId),
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
