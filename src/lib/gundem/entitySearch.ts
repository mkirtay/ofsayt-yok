/**
 * Gündem "Ekle" seçicisinin araması (`GET /api/gundem/entities/search?q=`): oyuncu, takım ve dün/bugün/yarının maçları.
 *
 * Kaynaklar (hepsi paylaşımlı önbellekli): `players/search/{q}` (asistanla aynı), `teams/search/{q}` (başlık aramasıyla
 * aynı), maçlar ana sayfanın gün listeleri (`loadHomeDay`) — yeni istek türü yok. Saf kurallar burada (test edilir).
 */
import type { Match } from '@/models/liveScore';
import { deriveMatchPhase } from '@/utils/matchPhase';
import { matchKickoffMs } from '@/utils/matchActivity';
import { normalizeSearchText } from '@/utils/searchText';
import { normalizeDisplayName } from '@/utils/displayName';

/** Sportmonks arama terimiyle aynı karakter kümesi (bkz. proxyAllowlist `teams/search/{q}`). */
const QUERY_RE = /^[\p{L}\p{M}\p{N} .'’&(),-]{2,40}$/u;
export const ENTITY_SEARCH_MIN_CHARS = 2;
export const PLAYER_SEARCH_MIN_CHARS = 3;
export const ENTITY_SEARCH_LIMIT = 5;
export const MATCH_SEARCH_LIMIT = 6;

/** Geçerli arama terimi ya da null (boş / kısa / izin dışı karakter). */
export function normalizeEntityQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  return QUERY_RE.test(q) ? q : null;
}

export type EntitySearchPlayer = { id: number; name: string; photo: string | null };
export type EntitySearchTeam = { id: number; name: string; logo: string | null };
export type EntitySearchMatch = {
  id: number;
  home: { name: string; logo: string | null };
  away: { name: string; logo: string | null };
  league: string | null;
  startingAt: string | null;
  status: string;
};
export type EntitySearchResult = { players: EntitySearchPlayer[]; teams: EntitySearchTeam[]; matches: EntitySearchMatch[] };

type RawPlayer = { id: number; display_name?: string | null; common_name?: string | null; name?: string | null; image_path?: string | null };

/** Oyuncu satırları: tam ad eşleşmesi öne (asistan kuralı), adı olmayan atılır. */
export function mapPlayerHits(rows: RawPlayer[], q: string, limit = ENTITY_SEARCH_LIMIT): EntitySearchPlayer[] {
  const nq = normalizeSearchText(q);
  const name = (r: RawPlayer) => normalizeDisplayName(r.display_name ?? r.common_name ?? r.name ?? '') ?? '';
  const exact = (r: RawPlayer) => [r.display_name, r.common_name, r.name].some((n) => n && normalizeSearchText(n) === nq);
  return [...rows.filter(exact), ...rows.filter((r) => !exact(r))]
    .filter((r) => Number.isSafeInteger(r.id) && name(r))
    .slice(0, limit)
    .map((r) => ({ id: r.id, name: name(r), photo: r.image_path ?? null }));
}

const phaseOrder = { LIVE: 0, HT: 0, PRE: 1, POST: 2 } as const;

/**
 * Gün listelerinden takım adı eşleşen maçlar (tekil, canlı sürüm öncelikli). Sıra: canlı → başlamamış (yakın önce) →
 * bitmiş (yeni önce). `q` null → hepsi (boş arama: "bugünün maçları").
 */
export function pickMatchHits(lists: Match[][], q: string | null, limit = MATCH_SEARCH_LIMIT): EntitySearchMatch[] {
  const byId = new Map<number, Match>();
  for (const m of lists.flat()) {
    const id = Number(m.id);
    if (!Number.isSafeInteger(id) || !m.home?.name || !m.away?.name) continue;
    const prev = byId.get(id);
    // Sonra gelen liste (canlı) aynı maçın daha güncel hâli.
    if (!prev || deriveMatchPhase(m.status) !== 'PRE' || deriveMatchPhase(prev.status) === 'PRE') byId.set(id, m);
  }
  const nq = q ? normalizeSearchText(q) : null;
  const hits = [...byId.values()].filter(
    (m) => !nq || normalizeSearchText(m.home.name).includes(nq) || normalizeSearchText(m.away.name).includes(nq),
  );
  const kick = (m: Match) => matchKickoffMs(m) ?? 0;
  hits.sort((a, b) => {
    const pa = phaseOrder[deriveMatchPhase(a.status)];
    const pb = phaseOrder[deriveMatchPhase(b.status)];
    if (pa !== pb) return pa - pb;
    return pa === 2 ? kick(b) - kick(a) : kick(a) - kick(b);
  });
  return hits.slice(0, limit).map((m) => {
    const k = matchKickoffMs(m);
    return {
      id: Number(m.id),
      home: { name: m.home.name, logo: m.home.logo ?? null },
      away: { name: m.away.name, logo: m.away.logo ?? null },
      league: m.competition?.name ?? null,
      startingAt: k != null ? new Date(k).toISOString() : null,
      status: m.status,
    };
  });
}
