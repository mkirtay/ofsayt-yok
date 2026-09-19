/**
 * Split-view seçili maç durumu — URL query'sinde (`/?match=123-galatasaray-fenerbahce`)
 * yaşar. Böylece link paylaşılabilir, tarayıcı geri/ileri tuşu seçimi geri alır/yineler.
 * Saf fonksiyonlar: router'a bağımlı değil (test edilebilir).
 */
import { parseMatchIdFromParam } from '@/utils/matchUrl';

export const MATCH_QUERY_KEY = 'match';
/** Split-view takım paneli: `/?team=13860`. `match` ile karşılıklı dışlayıcı (panelde aynı anda biri açık). */
export const TEAM_QUERY_KEY = 'team';

export type QueryLike = Record<string, string | string[] | undefined>;

function firstString(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

/** Ham `?match=` değeri (id veya `id-slug`) — geçersizse null. */
export function readSelectedMatchParam(query: QueryLike): string | null {
  const raw = firstString(query[MATCH_QUERY_KEY]);
  if (!raw) return null;
  return /^\d+(-[a-z0-9-]*)?$/i.test(raw) ? raw : null;
}

/** `?match=` değerinden yalnızca maç id'si. */
export function readSelectedMatchId(query: QueryLike): string | null {
  const raw = readSelectedMatchParam(query);
  return raw ? parseMatchIdFromParam(raw) : null;
}

/** `?team=` değerinden takım id'si (yalnızca sayısal). */
export function readSelectedTeamId(query: QueryLike): string | null {
  const raw = firstString(query[TEAM_QUERY_KEY]);
  return raw && /^\d+$/.test(raw) ? raw : null;
}

/**
 * Mevcut query'yi koruyarak `match` paramını ekler/günceller/siler.
 * `null` → param kaldırılır. Diğer paramlar (tab, panel, league…) korunur.
 */
export function withSelectedMatch(query: QueryLike, matchParam: string | null): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    // `team` da düşer: maç seçmek/paneli kapatmak takım panelini de kapatır (tek panel).
    if (k === MATCH_QUERY_KEY || k === TEAM_QUERY_KEY) continue;
    const s = firstString(v);
    if (s != null) next[k] = s;
  }
  if (matchParam) next[MATCH_QUERY_KEY] = matchParam;
  return next;
}

/** Takım paneli için query: `team` ekler/siler, `match`'i düşürür (mevcut diğer paramlar korunur). */
export function withSelectedTeam(query: QueryLike, teamId: string | null): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k === MATCH_QUERY_KEY || k === TEAM_QUERY_KEY) continue;
    const s = firstString(v);
    if (s != null) next[k] = s;
  }
  if (teamId) next[TEAM_QUERY_KEY] = teamId;
  return next;
}

export function buildTeamSelectionTarget(
  pathname: string,
  query: QueryLike,
  teamId: string | null,
): { pathname: string; query: Record<string, string> } {
  return { pathname, query: withSelectedTeam(query, teamId) };
}

/** Split-view hedef URL'i (pathname + query) — `router.push({ pathname, query }, undefined, { shallow: true })`. */
export function buildSelectionTarget(
  pathname: string,
  query: QueryLike,
  matchParam: string | null,
): { pathname: string; query: Record<string, string> } {
  return { pathname, query: withSelectedMatch(query, matchParam) };
}

/** Tıklama yeni sekme/pencere niyeti taşıyorsa (cmd/ctrl/shift/orta tuş) split-view araya girmez. */
export function isModifiedClick(e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}
