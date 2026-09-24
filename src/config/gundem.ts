/** Gündem sınırları — sunucu (API) ve istemci (composer sayacı) AYNI sabiti kullanır. */
export const POST_MAX_LENGTH = 280;
export const COMMENT_MAX_LENGTH = 280;
/** Sayaç bu değerin altına inince uyarı rengine geçer. */
export const COUNTER_WARN_AT = 20;

/**
 * Kill-switch (sunucu): `GUNDEM_MATCH_POSTS_IN_ALL=false` → maç postları "Tümü" akışından çıkar, yalnızca `scope=match`'te
 * görünür. Tanımsız/başka her değer → görünür (varsayılan).
 */
export function matchPostsInAllFeed(): boolean {
  return process.env.GUNDEM_MATCH_POSTS_IN_ALL?.trim().toLowerCase() !== 'false';
}
