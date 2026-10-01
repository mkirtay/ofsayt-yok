import type { MatchLineupData } from '@/models/domain';
import type { MatchPhase } from './matchPhase';

/**
 * Kadro tahmini mi ("Muhtemel 11")? Sportmonks maça günler kala yedeksiz 22 kişilik tahmini kadro döndürebiliyor.
 * Önce metadata 572 (`confirmed`); alan gelmediyse: maç başlamadı ve yedek listesi yok → tahmini.
 */
export function isProbableLineup(data: MatchLineupData, phase: MatchPhase): boolean {
  if (data.confirmed === false) return true;
  if (data.confirmed === true) return false;
  const hasBench = [data.lineup?.home, data.lineup?.away].some((team) =>
    team?.players?.some((p) => p.substitution === '1'),
  );
  return phase === 'PRE' && !hasBench;
}
