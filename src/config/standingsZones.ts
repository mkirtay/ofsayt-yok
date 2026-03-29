import {
  UEFA_CHAMPIONS_LEAGUE_ID,
} from './leagues';

/**
 * Puan tablosu # sütunu renkleri — API bölge vermediği için lig kuralları.
 */

/** `uefa_league_playoff`: ŞL lig aşaması sıralaması 9–24 (knockout playoff turu) */
export type StandingsZoneKind =
  | 'ucl'
  | 'ucl_qual'
  | 'europa'
  | 'conference_qual'
  | 'promotion'
  | 'playoff'
  | 'uefa_league_playoff'
  | 'relegation';

export interface StandingsZoneRules {
  promotionTopN: number;
  playoffFromRank: number;
  playoffToRank: number;
  relegationBottomN: number;
  disabled?: boolean;
}

export const DEFAULT_STANDINGS_ZONE_RULES: StandingsZoneRules = {
  promotionTopN: 1,
  playoffFromRank: 2,
  playoffToRank: 5,
  relegationBottomN: 5,
};

export const STANDINGS_ZONES_BY_COMPETITION: Record<number, Partial<StandingsZoneRules>> = {
  24: {
    promotionTopN: 4,
    playoffFromRank: 5,
    playoffToRank: 6,
    relegationBottomN: 4,
  },
  332: {
    promotionTopN: 1,
    playoffFromRank: 2,
    playoffToRank: 5,
    relegationBottomN: 5,
  },
};

/** Türkiye Süper Lig */
export const SUPER_LIG_COMPETITION_ID = 6;

/** İngiltere Premier Lig */
export const PREMIER_LEAGUE_COMPETITION_ID = 2;

/** UEFA ŞL yeni lig aşaması (36 takım) — tablo 36 satırsa bu kurallar uygulanır */
export const UEFA_LEAGUE_PHASE_TEAM_COUNT = 36;

export function getMergedStandingsZoneRules(competitionId?: number): StandingsZoneRules & {
  disabled?: boolean;
} {
  const base = { ...DEFAULT_STANDINGS_ZONE_RULES };
  if (competitionId == null || !Number.isFinite(competitionId)) {
    return base;
  }
  const extra = STANDINGS_ZONES_BY_COMPETITION[competitionId];
  if (!extra) return base;
  return { ...base, ...extra };
}

function defaultZoneFromRules(
  rank: number,
  totalTeams: number,
  competitionId?: number
): StandingsZoneKind | null {
  const rules = getMergedStandingsZoneRules(competitionId);
  if (rules.disabled) return null;

  const r = Math.trunc(rank);
  if (r < 1 || r > totalTeams) return null;

  if (r <= rules.promotionTopN) return 'promotion';

  const playoffEnd = Math.min(rules.playoffToRank, totalTeams);
  if (r >= rules.playoffFromRank && r <= playoffEnd) return 'playoff';

  const nRel = Math.min(Math.max(0, rules.relegationBottomN), totalTeams);
  if (nRel === 0) return null;
  const relStart = totalTeams - nRel + 1;
  if (r >= relStart) return 'relegation';

  return null;
}

/**
 * Son N sıra düşme hattı (küme sayısı değişirse totalTeams üzerinden).
 */
function isBottomN(rank: number, totalTeams: number, n: number): boolean {
  if (totalTeams < 1 || n < 1) return false;
  const relStart = totalTeams - Math.min(n, totalTeams) + 1;
  return rank >= relStart;
}

export function getStandingRankZone(
  rank: number,
  totalTeams: number,
  competitionId?: number
): StandingsZoneKind | null {
  if (totalTeams < 1 || !Number.isFinite(rank)) return null;
  const r = Math.trunc(rank);
  if (r < 1 || r > totalTeams) return null;

  const cid = competitionId;

  // —— UEFA Şampiyonlar Ligi: lig aşaması 36 takım (2024+) ——
  if (cid === UEFA_CHAMPIONS_LEAGUE_ID && totalTeams === UEFA_LEAGUE_PHASE_TEAM_COUNT) {
    if (r >= 1 && r <= 8) return 'promotion';
    if (r >= 9 && r <= 24) return 'uefa_league_playoff';
    if (r >= 25 && r <= 36) return 'relegation';
    return null;
  }

  // —— Türkiye Süper Lig ——
  if (cid === SUPER_LIG_COMPETITION_ID) {
    if (r === 1) return 'ucl';
    if (r === 2) return 'ucl_qual';
    if (r === 3) return 'europa';
    if (r === 4) return 'conference_qual';
    if (isBottomN(r, totalTeams, 3)) return 'relegation';
    return null;
  }

  // —— Premier Lig ——
  if (cid === PREMIER_LEAGUE_COMPETITION_ID) {
    if (r >= 1 && r <= 4) return 'ucl';
    if (r === 5) return 'europa';
    if (r === 6) return 'conference_qual';
    if (isBottomN(r, totalTeams, 3)) return 'relegation';
    return null;
  }

  return defaultZoneFromRules(r, totalTeams, cid);
}
