/**
 * Gündem split-view seçili post durumu — URL query'sinde (`/gundem?post=<id>`) yaşar (matchSelection.ts kalıbı).
 * Böylece link paylaşılabilir, tarayıcı geri/ileri tuşu seçimi geri alır/yineler. Saf fonksiyonlar: router'a bağımlı değil.
 */
export const POST_QUERY_KEY = 'post';

export type QueryLike = Record<string, string | string[] | undefined>;

function firstString(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

/** `?post=` değeri (cuid) — geçersizse null (path/script enjeksiyonu vb. reddedilir). */
export function readSelectedPostId(query: QueryLike): string | null {
  const raw = firstString(query[POST_QUERY_KEY]);
  return raw && /^[a-z0-9]{8,40}$/i.test(raw) ? raw : null;
}

/** Mevcut query'yi koruyarak `post` paramını ekler/günceller/siler (`null` → kaldırılır; `scope` gibi diğerleri korunur). */
export function withSelectedPost(query: QueryLike, postId: string | null): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k === POST_QUERY_KEY) continue;
    const s = firstString(v);
    if (s != null) next[k] = s;
  }
  if (postId) next[POST_QUERY_KEY] = postId;
  return next;
}

/** `router.push({ pathname, query }, undefined, { shallow: true })` hedefi. */
export function buildPostSelectionTarget(
  pathname: string,
  query: QueryLike,
  postId: string | null,
): { pathname: string; query: Record<string, string> } {
  return { pathname, query: withSelectedPost(query, postId) };
}
