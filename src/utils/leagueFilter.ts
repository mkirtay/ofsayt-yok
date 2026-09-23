import {
  BIG_FIVE_COMPETITION_ORDER,
  SIDEBAR_LEAGUES,
  TURKEY_COMPETITION_IDS,
  UEFA_SIDEBAR_LEAGUES,
} from '@/config/leagues';
import { isSportmonksProviderEnabled, resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';
import { parseLeagueImagePath, sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { uefaCompetitionLogoSrcById } from '@/utils/competitionLogo';
import { leagueDisplayName, type LeagueTranslate } from '@/utils/leagueName';

/**
 * Ana sayfa lig filtresi (hesapsız, `localStorage`). Aktif üst sekmeden (Hepsi/Canlı/Bitmiş/Favoriler)
 * bağımsızdır. DİKKAT: "Favoriler" sekmesi favori MAÇLAR içindir — bu özellik "Liglerim"dir.
 *
 * ID UZAYI: seçimler maçın kendi `competition.id` değeriyle tutulur (Sportmonks açıkken Sportmonks
 * league_id, kapalıyken legacy id). Preset'ler (Süper Lig / 5 Büyük Lig) legacy id'lerden çözülür.
 */

export const LEAGUE_FILTER_STORAGE_KEY = 'oy:league-filter:v1';

export type LeagueFilterMode = 'all' | 'super' | 'big5' | 'custom';
export type PickedLeague = { id: number; name: string };
export type LeagueFilterState = { mode: LeagueFilterMode; custom: PickedLeague[] };

export const DEFAULT_LEAGUE_FILTER: LeagueFilterState = { mode: 'all', custom: [] };

const MODES: LeagueFilterMode[] = ['all', 'super', 'big5', 'custom'];

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // gizli mod / engelli çerez
  }
}

/** Bozuk / eski / elle düzenlenmiş değerlere karşı doğrulayarak okur; şüphede varsayılan (filtre yok). */
export function parseLeagueFilter(raw: string | null | undefined): LeagueFilterState {
  if (!raw) return DEFAULT_LEAGUE_FILTER;
  try {
    const v = JSON.parse(raw) as { mode?: unknown; custom?: unknown };
    const custom: PickedLeague[] = Array.isArray(v.custom)
      ? v.custom
          .filter(
            (c): c is PickedLeague =>
              !!c && typeof (c as PickedLeague).id === 'number' && Number.isFinite((c as PickedLeague).id),
          )
          .map((c) => ({ id: c.id, name: typeof c.name === 'string' ? c.name : '' }))
      : [];
    const mode = MODES.includes(v.mode as LeagueFilterMode) ? (v.mode as LeagueFilterMode) : 'all';
    // Seçim yokken "custom" anlamsız → filtre yok.
    return { mode: mode === 'custom' && custom.length === 0 ? 'all' : mode, custom };
  } catch {
    return DEFAULT_LEAGUE_FILTER;
  }
}

export function isDefaultLeagueFilter(s: LeagueFilterState): boolean {
  return s.mode === 'all' && s.custom.length === 0;
}

export function readLeagueFilter(storage: StorageLike | null = browserStorage()): LeagueFilterState {
  if (!storage) return DEFAULT_LEAGUE_FILTER;
  try {
    return parseLeagueFilter(storage.getItem(LEAGUE_FILTER_STORAGE_KEY));
  } catch {
    return DEFAULT_LEAGUE_FILTER;
  }
}

/** Varsayılan duruma dönüldüğünde anahtar TEMİZLENİR (boş kayıt bırakılmaz). */
export function writeLeagueFilter(state: LeagueFilterState, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  try {
    if (isDefaultLeagueFilter(state)) storage.removeItem(LEAGUE_FILTER_STORAGE_KEY);
    else storage.setItem(LEAGUE_FILTER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* kota dolu / engelli — filtre yalnızca oturum boyunca çalışır */
  }
}

/** Legacy `competition_id` → maçların taşıdığı `competition.id` (Sportmonks açıkken league_id). Çözülemezse null. */
export function toMatchCompetitionId(legacyId: number): number | null {
  return isSportmonksProviderEnabled() ? resolveSportmonksLeagueId(legacyId) : legacyId;
}

function mapLegacy(ids: readonly number[]): number[] {
  return ids.map(toMatchCompetitionId).filter((x): x is number => x != null);
}

/** Süper Lig = yalnızca 1. kademe (1. Lig / Kupa DEĞİL). */
export const SUPER_LIG_LEGACY_ID = TURKEY_COMPETITION_IDS[0];

export function presetCompetitionIds(kind: 'super' | 'big5'): Set<number> {
  return new Set(mapLegacy(kind === 'super' ? [SUPER_LIG_LEGACY_ID] : BIG_FIVE_COMPETITION_ORDER));
}

/** `null` = filtre yok. */
export function activeCompetitionIds(state: LeagueFilterState): Set<number> | null {
  switch (state.mode) {
    case 'super':
    case 'big5':
      return presetCompetitionIds(state.mode);
    case 'custom':
      return state.custom.length ? new Set(state.custom.map((c) => c.id)) : null;
    default:
      return null;
  }
}

type WithCompetition = { competition?: { id: number } | null; competition_id?: number };

export function filterMatchesByLeagues<T extends WithCompetition>(matches: T[], state: LeagueFilterState): T[] {
  const ids = activeCompetitionIds(state);
  if (!ids) return matches;
  return matches.filter((m) => ids.has(m.competition?.id ?? m.competition_id ?? -1));
}

// ── Seçim paneli kataloğu ───────────────────────────────────────────────────

export type CatalogLeague = { id: number; name: string; country?: string; known: boolean; logo?: string };

type CatalogSource = WithCompetition & {
  competition?: { id: number; name?: string; logo?: string } | null;
  competition_name?: string;
  country?: { name?: string } | null;
};

/**
 * "Tam lig listesi": bilinen (sidebar + UEFA) ligler + yüklü maçlarda görülen ligler + daha önce
 * seçilmiş (bugün maçı olmasa da listede kalır). Bilinenler önce (sabit sıra), kalanlar alfabetik.
 *
 * `t` verilirse BİLİNEN liglerin adı `leagues` namespace'inden çevrilir; API'den gelenler kendi
 * adıyla kalır (çevirileri yok). Verilmezse hepsi config'teki Türkçe adla döner.
 */
export function buildLeagueCatalog(
  matches: CatalogSource[],
  picked: PickedLeague[] = [],
  t?: LeagueTranslate,
): CatalogLeague[] {
  const byId = new Map<number, CatalogLeague>();

  // Logo: maç listesi grup başlıklarıyla AYNI kaynak → `competition.logo` (API image_path), yoksa UEFA yerel svg;
  // bilinen ligler için ek olarak config `logo`'su ve (Sportmonks açıkken) CDN'den türetilen URL.
  const derivedLogo = (id: number) => (isSportmonksProviderEnabled() ? sportmonksLeagueLogoUrl(id) : null);
  for (const l of [...SIDEBAR_LEAGUES, ...UEFA_SIDEBAR_LEAGUES]) {
    const id = toMatchCompetitionId(l.id);
    if (id == null) continue;
    const logo = parseLeagueImagePath(l.logo) ?? uefaCompetitionLogoSrcById(l.id) ?? derivedLogo(id);
    byId.set(id, { id, name: t ? leagueDisplayName(l, t) : l.name, known: true, ...(logo ? { logo } : {}) });
  }
  for (const m of matches) {
    const id = m.competition?.id ?? m.competition_id;
    if (id == null) continue;
    const existing = byId.get(id);
    const country = m.country?.name;
    const apiLogo = parseLeagueImagePath(m.competition?.logo);
    if (existing) {
      if (!existing.country && country) existing.country = country;
      if (apiLogo) existing.logo = apiLogo; // canlı `image_path` birincil kaynak
      continue;
    }
    const name = m.competition?.name || m.competition_name;
    const logo = apiLogo ?? uefaCompetitionLogoSrcById(id) ?? derivedLogo(id);
    if (name) byId.set(id, { id, name, ...(country ? { country } : {}), known: false, ...(logo ? { logo } : {}) });
  }
  for (const p of picked) {
    if (!byId.has(p.id) && p.name) {
      const logo = derivedLogo(p.id);
      byId.set(p.id, { id: p.id, name: p.name, known: false, ...(logo ? { logo } : {}) });
    }
  }

  const knownOrder = [...SIDEBAR_LEAGUES, ...UEFA_SIDEBAR_LEAGUES]
    .map((l) => toMatchCompetitionId(l.id))
    .filter((x): x is number => x != null);
  const all = [...byId.values()];
  const known = all.filter((l) => l.known).sort((a, b) => knownOrder.indexOf(a.id) - knownOrder.indexOf(b.id));
  const rest = all.filter((l) => !l.known).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return [...known, ...rest];
}

/** Türkçe duyarlı arama normalizasyonu: "İ/ı/Ş/ğ…" ve aksanlar sadeleşir. */
export function normalizeSearch(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function searchLeagues(list: CatalogLeague[], query: string): CatalogLeague[] {
  const q = normalizeSearch(query);
  if (!q) return list;
  return list.filter((l) => normalizeSearch(`${l.name} ${l.country ?? ''}`).includes(q));
}
