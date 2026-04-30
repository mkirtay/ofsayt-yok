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
