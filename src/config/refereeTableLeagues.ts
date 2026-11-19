/** /hakemler sayfasının ligleri (adres slug'ı → Sportmonks league_id). İlk lig varsayılan (`/hakemler`). */
/** `nameKey`: `leagues` namespace'inde `short.<key>` (ör. "Süper Lig"). */
/**
 * `group`: lig seçicideki satır (Türkiye / UEFA / Avrupa ligleri).
 * `source`: tablonun kaynağı — `referee-stats` (sezonun hakem listesi + hakem başına `referees/{id}` istatistik kaydı; hakem
 * kartıyla ortak önbellek) ya da `fixtures` (sezonun BİTMİŞ maçları, olay + faul süzgeçli, 50'lik sayfalar: UCL ~4, büyük
 * ligler ~3 Fixture isteği). UEFA sezonunun hakem listesi yardımcılar + elemeler dahil ~390 kişi → hakem başına istek
 * yerine fikstür taraması (bkz. server/people/refereeFixtureTable.ts).
 */
export type RefereeTableGroup = 'tr' | 'uefa' | 'europe';
export type RefereeTableLeague = { id: number; slug: string; nameKey: string; group: RefereeTableGroup; source: 'referee-stats' | 'fixtures' };

export const REFEREE_TABLE_LEAGUES: readonly RefereeTableLeague[] = [
  { id: 600, slug: 'super-lig', nameKey: 'superLig', group: 'tr', source: 'referee-stats' },
  { id: 603, slug: '1-lig', nameKey: 'tffFirstLeague', group: 'tr', source: 'referee-stats' },
  { id: 606, slug: 'turkiye-kupasi', nameKey: 'turkishCup', group: 'tr', source: 'referee-stats' },
  { id: 2, slug: 'sampiyonlar-ligi', nameKey: 'championsLeague', group: 'uefa', source: 'fixtures' },
  { id: 5, slug: 'avrupa-ligi', nameKey: 'europaLeague', group: 'uefa', source: 'fixtures' },
  { id: 2286, slug: 'konferans-ligi', nameKey: 'conferenceLeague', group: 'uefa', source: 'fixtures' },
  { id: 8, slug: 'premier-lig', nameKey: 'premierLeague', group: 'europe', source: 'fixtures' },
  { id: 564, slug: 'la-liga', nameKey: 'laLiga', group: 'europe', source: 'fixtures' },
  { id: 384, slug: 'serie-a', nameKey: 'serieA', group: 'europe', source: 'fixtures' },
  { id: 82, slug: 'bundesliga', nameKey: 'bundesliga', group: 'europe', source: 'fixtures' },
  { id: 301, slug: 'ligue-1', nameKey: 'ligue1', group: 'europe', source: 'fixtures' },
];

export const REFEREE_TABLE_GROUPS: readonly RefereeTableGroup[] = ['tr', 'uefa', 'europe'];

/** UEFA kulüp turnuvaları (Süper Kupa dahil) — hakem sayfası "UEFA kariyeri" özeti. */
export const UEFA_CLUB_LEAGUE_IDS: ReadonlySet<number> = new Set([2, 5, 2286, 1328]);

export const DEFAULT_REFEREE_TABLE_LEAGUE = REFEREE_TABLE_LEAGUES[0]!;

/** "2026/2027" → "2026-2027" (adres); "2026/27" kısa gösterim için `shortSeasonName`. */
export function seasonSlugOf(name: string): string {
  return name.trim().replace(/\//g, '-').replace(/\s+/g, '');
}

export function shortSeasonName(name: string): string {
  const m = /^(\d{4})\/(\d{2})(\d{2})$/.exec(name.trim());
  return m ? `${m[1]}/${m[3]}` : name;
}

/** Lig + sezon → kanonik adres: varsayılan lig yalnız `/hakemler`, güncel sezon sezon parçası olmadan. */
export function refereeTablePath(leagueSlug: string, seasonSlug: string | null, isCurrent: boolean): string {
  const leaguePart = leagueSlug === DEFAULT_REFEREE_TABLE_LEAGUE.slug && isCurrent ? '' : `/${leagueSlug}`;
  const seasonPart = isCurrent || !seasonSlug ? '' : `/${seasonSlug}`;
  return `/hakemler${leaguePart}${seasonPart}`;
}

/**
 * Hakem sayfasından tabloya "karşılaştır" linki: hakemin en son sezonu tablodaki liglerden birindeyse o lig + sezon
 * (aynı sezonda birden çok tablo ligi varsa önce Türkiye ligleri, sonra en çok maçlı satır, eşitlikte listedeki sıra)
 * (`?a=` ile hakem seçili gelir), yoksa varsayılan lig. Sezon parçası hep yazılır (yönlendirme sorguyu düşürmesin).
 */
export function refereeComparePath(seasons: readonly { leagueId: number | null; seasonName: string; matches?: number }[], slug: string): string {
  const latest = seasons.find((s) => REFEREE_TABLE_LEAGUES.some((l) => l.id === s.leagueId))?.seasonName;
  const inLatest = seasons.filter((s) => s.seasonName === latest);
  const order = (id: number | null) => REFEREE_TABLE_LEAGUES.findIndex((l) => l.id === id);
  const isTr = (id: number | null) => (REFEREE_TABLE_LEAGUES[order(id)]?.group === 'tr' ? 0 : 1);
  const row = inLatest
    .filter((s) => order(s.leagueId) >= 0)
    .sort((a, b) => isTr(a.leagueId) - isTr(b.leagueId) || (b.matches ?? 0) - (a.matches ?? 0) || order(a.leagueId) - order(b.leagueId))[0];
  const league = REFEREE_TABLE_LEAGUES.find((l) => l.id === row?.leagueId) ?? DEFAULT_REFEREE_TABLE_LEAGUE;
  const base = row ? `/hakemler/${league.slug}/${seasonSlugOf(row.seasonName)}` : '/hakemler';
  return `${base}?a=${encodeURIComponent(slug)}`;
}
