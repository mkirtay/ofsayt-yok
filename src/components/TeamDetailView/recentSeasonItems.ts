/**
 * Son Maçlar listesinde sezon ayracı: güncel sezon seçiliyken "Daha fazla" ile (ya da ilk sayfada) geçen sezonun
 * maçlarına geçilen yerde ince bir "2025-2026 sezonu" satırı. Yalnız görsel bilgi; seçici güncel sezonda kalır.
 *
 * CLS: liste kutusu 10 satır (+ alt satır) yüksekliğini her durumda ayırır. İlk sayfa bu bütçeyi aşmaz: ayraç ilk
 * sayfaya düşerse bir maç daha az gösterilir (9 maç + ayraç = 384 px ≤ 400 px). Sonraki sayfalar kullanıcının
 * tıklamasıyla açılır (CLS'ye sayılmaz) ve her seferinde 10 maç ekler.
 */
import type { TeamMatch } from '@/services/sportmonks/teamOverview';

export const RECENT_ROW_PX = 40;
export const SEASON_DIVIDER_PX = 24;

export type RecentItem = { kind: 'match'; match: TeamMatch } | { kind: 'divider'; season: string };

/** Sezon değiştiği her yere (ve ilk maç güncel sezondan değilse en başa) ayraç ekler. */
export function buildRecentItems(
  matches: TeamMatch[],
  seasonOf?: (m: TeamMatch) => string | null | undefined,
  currentSeason?: string | null,
): RecentItem[] {
  const items: RecentItem[] = [];
  let prev = currentSeason ?? null;
  for (const match of matches) {
    const season = seasonOf?.(match) ?? null;
    if (season && prev && season !== prev) items.push({ kind: 'divider', season });
    if (season) prev = season;
    items.push({ kind: 'match', match });
  }
  return items;
}

/** İlk sayfada gösterilecek maç sayısı: maç + ayraç yüksekliği `pageSize` satırı aşmaz. */
export function initialRecentCount(items: RecentItem[], pageSize: number): number {
  const budget = pageSize * RECENT_ROW_PX;
  let used = 0;
  let count = 0;
  let pendingDivider = 0;
  for (const it of items) {
    if (it.kind === 'divider') {
      pendingDivider += SEASON_DIVIDER_PX;
      continue;
    }
    if (used + pendingDivider + RECENT_ROW_PX > budget) break;
    used += pendingDivider + RECENT_ROW_PX;
    pendingDivider = 0;
    count += 1;
  }
  return count;
}

/** İlk `count` maç ve onlardan önceki ayraçlar (ardından maç gelmeyen ayraç gösterilmez). */
export function visibleRecentItems(items: RecentItem[], count: number): RecentItem[] {
  const out: RecentItem[] = [];
  let pending: RecentItem | null = null;
  let n = 0;
  for (const it of items) {
    if (it.kind === 'divider') {
      pending = it;
      continue;
    }
    if (n >= count) break;
    if (pending) {
      out.push(pending);
      pending = null;
    }
    out.push(it);
    n += 1;
  }
  return out;
}
