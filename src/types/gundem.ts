/** Gündem API yanıt tipleri (sunucu `lib/gundem/posts.ts` serileştirmesiyle birebir; istemci hook/bileşenleri kullanır). */
export type GundemAuthor = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  followedByMe: boolean;
  followerCount: number;
  followingCount: number;
};

export type GundemPost = {
  id: string;
  body: string;
  createdAt: string;
  authorType: 'USER' | 'OFFICIAL_BOT';
  matchId: string | null;
  teamId: number | null;
  author: GundemAuthor;
  likes: number;
  comments: number;
  likedByMe: boolean;
};

export type GundemCommentUser = Pick<GundemAuthor, 'id' | 'name' | 'username' | 'image'>;

export type GundemComment = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  user: GundemCommentUser;
};

export type GundemPage<T> = { items: T[]; nextCursor: string | null };

export type GundemScope = 'all' | 'following' | 'official';
