import type { Match } from '@/models/liveScore';

// Not: UEFA sayfası/modu kaldırıldı; bu dosyada yalnızca hâlâ kullanılanlar kalır —
// eleme braketi tipleri (`UefaKnockoutBracket` + /world-cup) ve `sortMatchesForUefaList` (/world-cup listesi).

function matchSortKey(m: Match): string {
  const date = (m.date ?? '').trim();
  const time = (m.scheduled ?? m.time ?? '').trim();
  return `${date} ${time} ${m.id ?? ''}`;
}

export type BracketPair = {
  key: string;
  /** Aynı eşleşmenin iki ayağı birleşmiş olabilir; iki maç da tutulur */
  matches: Match[];
  home?: { id?: number; name?: string; logo?: string };
  away?: { id?: number; name?: string; logo?: string };
  /** Aggregate skor (iki maç toplamı), yoksa son maç skoru */
  scoreText?: string;
  /** Kazanan: 'home' | 'away' | 'tbd' */
  winner?: 'home' | 'away' | 'tbd';
};

export type BracketRound = {
  key: string;
  label: string;
  pairs: BracketPair[];
};

/** Maç listesinin ana sayfadaki gibi sıralanması: canlı → planlanmış → bitmiş (en yeni üstte) */
export function sortMatchesForUefaList(matches: Match[]): Match[] {
  const rankStatus = (s: string): number => {
    if (s === 'IN PLAY') return 0;
    if (s === 'HALF TIME BREAK') return 1;
    if (s === 'NOT STARTED' || s === 'SCHEDULED') return 2;
    if (s === 'FINISHED') return 3;
    return 4;
  };
  return [...matches].sort((a, b) => {
    const ra = rankStatus(a.status);
    const rb = rankStatus(b.status);
    if (ra !== rb) return ra - rb;
    if (ra === 3) {
      // Bitmiş maçlar: en yeni üstte
      return matchSortKey(b).localeCompare(matchSortKey(a));
    }
    return matchSortKey(a).localeCompare(matchSortKey(b));
  });
}
