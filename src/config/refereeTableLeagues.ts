/** /hakemler sayfasının ligleri (adres slug'ı → Sportmonks league_id). İlk lig varsayılan (`/hakemler`). */
/** `nameKey`: `leagues` namespace'inde `short.<key>` (ör. "Süper Lig"). */
export type RefereeTableLeague = { id: number; slug: string; nameKey: string };

export const REFEREE_TABLE_LEAGUES: readonly RefereeTableLeague[] = [
  { id: 600, slug: 'super-lig', nameKey: 'superLig' },
  { id: 603, slug: '1-lig', nameKey: 'tffFirstLeague' },
  { id: 606, slug: 'turkiye-kupasi', nameKey: 'turkishCup' },
];

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
 * (`?a=` ile hakem seçili gelir), yoksa varsayılan lig. Sezon parçası hep yazılır (yönlendirme sorguyu düşürmesin).
 */
export function refereeComparePath(seasons: readonly { leagueId: number | null; seasonName: string }[], slug: string): string {
  const row = seasons.find((s) => REFEREE_TABLE_LEAGUES.some((l) => l.id === s.leagueId));
  const league = REFEREE_TABLE_LEAGUES.find((l) => l.id === row?.leagueId) ?? DEFAULT_REFEREE_TABLE_LEAGUE;
  const base = row ? `/hakemler/${league.slug}/${seasonSlugOf(row.seasonName)}` : '/hakemler';
  return `${base}?a=${encodeURIComponent(slug)}`;
}
