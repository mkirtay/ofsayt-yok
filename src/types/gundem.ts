/** Gündem API yanıt tipleri (sunucu `lib/gundem/posts.ts` serileştirmesiyle birebir; istemci hook/bileşenleri kullanır). */
export type GundemAuthor = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  /** Resmi hesap (allowlist ya da legacy bot) — doğrulanmış rozeti. Sunucuda türetilir. */
  official: boolean;
  /** Hesabını silmiş kullanıcının anonimleştirilmiş içeriği ("Silinmiş kullanıcı"; profil yok). Eski yanıtlarda yok. */
  deleted?: boolean;
  followedByMe: boolean;
  followerCount: number;
  followingCount: number;
};

/**
 * Profil başlığı: yazar alanları + silinmemiş post sayısı + resmi hesap bayrağı (`GET /api/gundem/users/[userId]`).
 * `blockedByMe`: izleyici bu kullanıcıyı engellemiş mi (eski yanıtlarda yok).
 */
export type GundemUserProfile = GundemAuthor & { postCount: number; blockedByMe?: boolean };

/** Doğrulanmış @etiket (sunucu yazma anında çözer) → profil bağlantısı. Eski yanıtlarda alan yok. */
export type GundemMention = { username: string; userId: string };

export type GundemMatchTeam = { id: number; name: string; shortName: string | null; logo: string | null };

/** Maç postu rozeti (`MatchSnapshot`). Snapshot'ı olmayan eski maç postlarında null. */
export type GundemMatchBadge = {
  fixtureId: string;
  startingAt: string;
  leagueId: number | null;
  home: GundemMatchTeam;
  away: GundemMatchTeam;
};

export type GundemPost = {
  id: string;
  body: string;
  createdAt: string;
  authorType: 'USER' | 'OFFICIAL_BOT';
  matchId: string | null;
  match: GundemMatchBadge | null;
  teamId: number | null;
  author: GundemAuthor;
  likes: number;
  comments: number;
  likedByMe: boolean;
  mentions?: GundemMention[];
  /** Moderasyonla gizlenmiş içerik — yalnız YAZARINA döner ("inceleme altında"). */
  underReview?: boolean;
};

export type GundemCommentUser = Pick<GundemAuthor, 'id' | 'name' | 'username' | 'image' | 'official' | 'deleted'>;

export type GundemComment = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  user: GundemCommentUser;
  mentions?: GundemMention[];
  underReview?: boolean;
};

export type GundemPage<T> = { items: T[]; nextCursor: string | null };

export type GundemScope = 'all' | 'following' | 'official' | 'match';

export type GundemNotificationType =
  | 'POST_LIKE'
  | 'POST_COMMENT'
  | 'FOLLOW'
  | 'OFFICIAL_POST'
  | 'MENTION'
  | 'MODERATION_WARNING'
  /** Gündem 1. sırası başka kullanıcıya geçti (aktörsüz; kullanılmayan günler iade edildi). */
  | 'PIN_OUTBID'
  /** 1. sıra mesajı yönetici tarafından kaldırıldı (aktörsüz). */
  | 'PIN_REMOVED';

/** `GET /api/gundem/notifications` satırı. `type` sunucuda serbest string: bilinmeyen değerler istemcide elenir. `post` silinmişse null. */
export type GundemNotification = {
  id: string;
  type: string;
  postId: string | null;
  createdAt: string;
  readAt: string | null;
  actor: Pick<GundemAuthor, 'id' | 'name' | 'username' | 'image' | 'official' | 'deleted'> | null;
  post: { id: string; body: string } | null;
};

/** `GET /api/gundem/pin` — Gündem 1. sıra (haftalık teklif). */
export type GundemPinState = {
  weekStart: string;
  /** Bir sonraki sıfırlama (Pazartesi 01:00 İstanbul). */
  resetsAt: string;
  minBid: number;
  maxBid: number;
  messageMaxLength: number;
  leader: {
    id: string;
    amount: number;
    since: string;
    /** İzleyici lideri engellediyse (ya da tersi) null. */
    message: string | null;
    user: { id: string; username: string | null; name: string | null; image: string | null };
    isMine: boolean;
  } | null;
};
