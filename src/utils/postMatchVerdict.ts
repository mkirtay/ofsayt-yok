/**
 * "AI ne dedi, ne oldu" (büyüme raporu 1.8): biten maçta öne çıkan 3 tahminin tuttu / tutmadı işareti, aynı URL'de.
 * Tam skordan çıkanlar `topPickHit` ile; ilk yarı pazarları devre skorundan. Bilinmiyorsa null (işaret yok).
 */
import { parseScore, topPickHit, type TopPick } from './analysisTopPicks';

export type PickVerdict = TopPick & { hit: boolean | null };

export function postMatchVerdicts(picks: readonly TopPick[], scores: { ft_score?: string; score?: string; ht_score?: string } | null | undefined): PickVerdict[] {
  const ft = parseScore(scores?.ft_score ?? scores?.score);
  const ht = parseScore(scores?.ht_score);
  return picks.map((p) => {
    let hit = topPickHit(p, ft, null);
    if (hit == null && ht) {
      if (p.key === 'htOver05') hit = ht.home + ht.away >= 1;
      else if (p.key === 'htOver15') hit = ht.home + ht.away >= 2;
      else if (p.key === 'bttsFirstHalf') hit = ht.home > 0 && ht.away > 0;
    }
    return { ...p, hit };
  });
}
