/**
 * `GET /api/gundem/posts` için IP rate limit + oturumsuz paylaşımlı cache ayarları.
 *
 * Rate limit (IP başına 120 / 60 sn): normal kullanım dakikada birkaç istektir — ana sayfa paneli açılışta 1, sonsuz
 * kaydırma sayfa başına 1 (20 post), /gundem sekme değişimi 1. Hızlı kaydıran biri bile ~1 istek/sn'yi (60/dk) geçmez;
 * bildirim polling'i ayrı endpoint. Mobil CGNAT / kampüs NAT'ında aynı IP'yi paylaşan kullanıcılar için 2 kat pay bırakıldı.
 *
 * Cache: yanıt kişiye özel (`likedByMe`, `followedByMe`, `scope=following`) → paylaşılan cache YALNIZCA oturumsuz istekte ve
 * `all`/`official`/`match` akışında. Oturumlu istek her zaman DB'den okunur: kendi postu/beğenisi/silmesi anında görünür.
 * Oturumsuz kullanıcı en fazla TTL (30 sn) gecikmeli görür. Anahtar: scope + matchId + `GUNDEM_MATCH_POSTS_IN_ALL` + cursor
 * (kill-switch çevrilince eski "Tümü" sayfaları okunmaz). Cache'lenen sayfa maç rozeti (snapshot) verisini de taşır → v2.
 */
export const FEED_GET_RATE_LIMIT = 120;
export const FEED_GET_RATE_WINDOW_MS = 60_000;
export const FEED_CACHE_TTL_SECONDS = 30;

export type FeedScope = 'all' | 'following' | 'official' | 'match';

/** Paylaşılan cache yalnızca oturumsuz + herkese aynı akış (`all`/`official`/`match`); `following` asla. */
export function isFeedCacheable(scope: FeedScope, viewerId: string | null): boolean {
  return viewerId === null && (scope === 'all' || scope === 'official' || scope === 'match');
}

export function feedCacheKey(
  scope: FeedScope,
  cursor: string | null,
  opts: { matchId: string | null; matchPostsInAll: boolean },
): string {
  return `gundem:feed:v2:${scope}:m${opts.matchId ?? '-'}:k${opts.matchPostsInAll ? 1 : 0}:${cursor ?? '-'}`;
}
