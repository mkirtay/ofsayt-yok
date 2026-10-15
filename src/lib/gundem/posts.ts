import type { MatchSnapshot, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAbsoluteImage } from '@/lib/siteUrl';
import { isOfficialUser } from '@/lib/gundem/official';
import { isDeletedUserId } from '@/config/deletedUser';
import { mentionsSelect, serializeMentions } from '@/lib/gundem/mentions';

/** `email` yalnızca `official` türetmek için okunur; `serializeUserRef`/`serializeAuthor` yanıttan çıkarır. */
export const authorSelect = { id: true, name: true, username: true, image: true, email: true } as const;

/** Yorum yazarı/bildirim aktörü: temel alanlar + `official`; e-posta sızmaz. */
export function serializeUserRef<T extends { email: string | null; image: string | null }>(row: T) {
  const { email, ...rest } = row;
  const id = (row as { id?: string }).id;
  // `deleted`: hesabını silmiş kullanıcının anonimleştirilmiş içeriği (config/deletedUser.ts) — web adı çevirir, profile bağlamaz.
  return { ...withAbsoluteImage(rest), official: isOfficialUser({ email }), deleted: isDeletedUserId(id) };
}

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
    hiddenAt: true,
    mentions: mentionsSelect,
    _count: { select: { likes: true, comments: { where: { deletedAt: null, hiddenAt: null } } } },
    likes: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
  } satisfies Prisma.PostSelect;
}

type AuthorRow = Prisma.UserGetPayload<{ select: ReturnType<typeof postAuthorSelect> }>;
type PostRow = Prisma.PostGetPayload<{ select: ReturnType<typeof postSelect> }>;

/** Yazar/profil serileştirmesi (post içindeki `author` ile profil endpoint'i aynısını kullanır). Kendi hesabında `followedByMe` her zaman false. */
export function serializeAuthor(row: AuthorRow, viewerId: string | null = null) {
  const { _count, followers, ...withEmail } = row;
  const { email, ...base } = withEmail;
  const viewerFollows = Array.isArray(followers) && followers.length > 0;
  return {
    ...withAbsoluteImage(base),
    official: isOfficialUser({ email }),
    deleted: isDeletedUserId(base.id),
    followedByMe: viewerFollows && base.id !== viewerId,
    followerCount: _count.followers,
    followingCount: _count.following,
  };
}

/** Rozet verisi (`GundemMatchBadge`). Snapshot'ı olmayan (eski) maç postlarında `match: null` — rozet gösterilmez. */
export function serializeMatchBadge(snap: MatchSnapshot) {
  return {
    fixtureId: snap.fixtureId,
    startingAt: snap.startingAt,
    leagueId: snap.leagueId,
    home: { id: snap.homeTeamId, name: snap.homeName, shortName: snap.homeShortName, logo: snap.homeLogo },
    away: { id: snap.awayTeamId, name: snap.awayName, shortName: snap.awayShortName, logo: snap.awayLogo },
  };
}

/**
 * `mentions` (isteğe bağlı alan): doğrulanmış @etiketler → profil bağlantısı. `underReview` yalnız gizlenmiş içeriğin
 * YAZARINA döner (diğerleri bu içeriği hiç almaz; bkz. lib/gundem/visibility.ts).
 */
export function serializePost(row: PostRow, viewerId: string | null = null, snapshot: MatchSnapshot | null = null) {
  const { _count, likes, author, hiddenAt, mentions, ...rest } = row;
  return {
    ...rest,
    match: snapshot ? serializeMatchBadge(snapshot) : null,
    author: serializeAuthor(author, viewerId),
    likes: _count.likes,
    comments: _count.comments,
    likedByMe: Array.isArray(likes) && likes.length > 0,
    mentions: serializeMentions(mentions),
    ...(hiddenAt && viewerId && author.id === viewerId ? { underReview: true as const } : {}),
  };
}

/** Yorum select'i (liste + oluşturma yanıtı aynı biçim). */
export const commentSelect = {
  id: true,
  postId: true,
  body: true,
  createdAt: true,
  hiddenAt: true,
  user: { select: authorSelect },
  mentions: mentionsSelect,
} satisfies Prisma.PostCommentSelect;

type CommentRow = Prisma.PostCommentGetPayload<{ select: typeof commentSelect }>;

export function serializeComment(row: CommentRow, viewerId: string | null = null) {
  const { hiddenAt, mentions, user, ...rest } = row;
  return {
    ...rest,
    user: serializeUserRef(user),
    mentions: serializeMentions(mentions),
    ...(hiddenAt && viewerId && user.id === viewerId ? { underReview: true as const } : {}),
  };
}

/**
 * Post listesini maç rozetleriyle serileştirir. `Post.matchId` → `MatchSnapshot` FK'sız olduğundan `include` yerine sayfa
 * başına TEK `fixtureId IN (...)` sorgusu (N+1 yok); maç postu yoksa sorgu da atılmaz.
 */
export async function serializePosts(rows: PostRow[], viewerId: string | null = null) {
  const matchIds = [...new Set(rows.map((r) => r.matchId).filter((id): id is string => !!id))];
  const snapshots = matchIds.length
    ? await prisma.matchSnapshot.findMany({ where: { fixtureId: { in: matchIds } } })
    : [];
  const byId = new Map(snapshots.map((s) => [s.fixtureId, s]));
  return rows.map((r) => serializePost(r, viewerId, r.matchId ? (byId.get(r.matchId) ?? null) : null));
}

/** Cursor sayfalama (take: N+1, cursor + skip: 1) kalıbı — `items`'ın son id'si `nextCursor`. */
export function paginate<T extends { id: string }>(rows: T[], pageSize: number) {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export const feedOrder = [{ createdAt: 'desc' }, { id: 'desc' }] as const satisfies Prisma.PostOrderByWithRelationInput[];
