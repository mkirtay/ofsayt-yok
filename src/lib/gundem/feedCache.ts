/**
 * `GET /api/gundem/posts` için IP rate limit + oturumsuz paylaşımlı cache ayarları.
 *
 * Rate limit (IP başına 120 / 60 sn): normal kullanım dakikada birkaç istektir — ana sayfa paneli açılışta 1, sonsuz
 * kaydırma sayfa başına 1 (20 post), /gundem sekme değişimi 1. Hızlı kaydıran biri bile ~1 istek/sn'yi (60/dk) geçmez;
 * bildirim polling'i ayrı endpoint. Mobil CGNAT / kampüs NAT'ında aynı IP'yi paylaşan kullanıcılar için 2 kat pay bırakıldı.
 *
 * Cache: yanıt kişiye özel (`likedByMe`, `followedByMe`, `scope=following`) → paylaşılan cache YALNIZCA oturumsuz istekte ve
 * `all`/`official` akışında. Oturumlu istek her zaman DB'den okunur: kendi postu/beğenisi/silmesi anında görünür.
 * Oturumsuz kullanıcı en fazla TTL (30 sn) gecikmeli görür. Cursor'lı sayfalar da cache'lenir (anahtarda cursor).
 */
export const FEED_GET_RATE_LIMIT = 120;
export const FEED_GET_RATE_WINDOW_MS = 60_000;
export const FEED_CACHE_TTL_SECONDS = 30;

export type FeedScope = 'all' | 'following' | 'official';

/** Paylaşılan cache yalnızca oturumsuz + herkese aynı akış (`all`/`official`). */
export function isFeedCacheable(scope: FeedScope, viewerId: string | null): boolean {
  return viewerId === null && (scope === 'all' || scope === 'official');
}

export function feedCacheKey(scope: FeedScope, cursor: string | null): string {
  return `gundem:feed:v1:${scope}:${cursor ?? '-'}`;
}
