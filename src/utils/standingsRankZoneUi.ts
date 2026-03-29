import type { StandingsZoneKind } from '@/config/standingsZones';
import rankZoneStyles from '@/styles/standingsRankZones.module.scss';

export function standingsRankZoneClass(zone: StandingsZoneKind | null): string | undefined {
  if (!zone) return undefined;
  switch (zone) {
    case 'ucl':
      return rankZoneStyles.rankUcl;
    case 'ucl_qual':
      return rankZoneStyles.rankUclQual;
    case 'europa':
      return rankZoneStyles.rankEuropa;
    case 'conference_qual':
      return rankZoneStyles.rankConferenceQual;
    case 'promotion':
      return rankZoneStyles.rankPromotion;
    case 'playoff':
      return rankZoneStyles.rankPlayoff;
    case 'uefa_league_playoff':
      return rankZoneStyles.rankUefaLeaguePlayoff;
    case 'relegation':
      return rankZoneStyles.rankRelegation;
    default:
      return undefined;
  }
}
