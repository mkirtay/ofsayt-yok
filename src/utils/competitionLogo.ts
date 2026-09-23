const UEFA_TIER2_COMPETITION_IDS = new Set([245, 244, 446]);

export function isUefaTier2CompetitionId(competitionId?: number | null): boolean {
  if (competitionId == null) return false;
  return UEFA_TIER2_COMPETITION_IDS.has(competitionId);
}

export function uefaCompetitionLogoSrcById(
  competitionId?: number | null,
): string | null {
  return isUefaTier2CompetitionId(competitionId)
    ? '/images/uefa-logo.svg'
    : null;
}

/**
 * Sportmonks'un şeffaf zeminli SİYAH / koyu gri lig logoları (Sportmonks league id):
 * 2 = Champions League, 5 = Europa League, 2286 = Conference League (cdn.sportmonks.com PNG'leri, 2026-09-24).
 * Koyu temada zeminle birleşip kayboluyorlar → `logo-backdrop` mixin'iyle açık bir zemin alırlar.
 * Diğer lig logoları renkli/açık kontrastlı, dokunulmaz.
 */
const DARK_ON_TRANSPARENT_LOGO_IDS = new Set([2, 5, 2286]);

export function competitionLogoNeedsBackdrop(competitionId?: number | null): boolean {
  return competitionId != null && DARK_ON_TRANSPARENT_LOGO_IDS.has(competitionId);
}
