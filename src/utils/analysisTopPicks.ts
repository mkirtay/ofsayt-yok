/**
 * Analizin "en güçlü 3 tahmini": maç sonucu + gol olasılıklarından en yüksek olasılıklı 3 madde. Analiz kartının
 * özet başlığındaki rozetler (MatchAnalysis) ve AI isabet sayfasının "en güçlü 3 tahmin" oranı AYNI seçimi kullanır —
 * kartta görünenle sayfada sayılan birebir aynı olsun.
 */

export type TopPickKey =
  | 'home'
  | 'draw'
  | 'away'
  | 'over15'
  | 'over25'
  | 'over35'
  | 'btts'
  | 'htOver05'
  | 'htOver15'
  | 'homeToScore'
  | 'awayToScore'
  | 'bttsFirstHalf';

export type TopPick = { key: TopPickKey; pct: number };

type ProbSource = {
  matchPrediction?: { home?: unknown; draw?: unknown; away?: unknown } | null;
  goalExpectation?: Partial<Record<Exclude<TopPickKey, 'home' | 'draw' | 'away'>, unknown>> | null;
};

/** En yüksek olasılıklı `n` madde (eşitlikte listedeki sıra korunur). */
export function pickTopPredictions(analysis: ProbSource, n = 3): TopPick[] {
  const mp = analysis.matchPrediction ?? {};
  const ge = analysis.goalExpectation ?? {};
  const candidates: Array<[TopPickKey, unknown]> = [
    ['home', mp.home],
    ['draw', mp.draw],
    ['away', mp.away],
    ['over15', ge.over15],
    ['over25', ge.over25],
    ['over35', ge.over35],
    ['btts', ge.btts],
    ['htOver05', ge.htOver05],
    ['htOver15', ge.htOver15],
    ['homeToScore', ge.homeToScore],
    ['awayToScore', ge.awayToScore],
    ['bttsFirstHalf', ge.bttsFirstHalf],
  ];
  return candidates
    .map(([key, v]) => ({ key, pct: Math.round(Number(v)) }))
    .filter((c) => Number.isFinite(c.pct) && c.pct > 0 && c.pct <= 100)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, n);
}

/** "2-1" → { home: 2, away: 1 }; geçersizse null. */
export function parseScore(score: string | null | undefined): { home: number; away: number } | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(score ?? '');
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

/**
 * Rozet tuttu mu? Kartta her rozet "bu olacak" iddiasıdır ("Ev sahibi gol bulur %82", "Ev sahibi kazanır %45") →
 * isabet = olay gerçekleşti mi. Tam skordan çıkarılabilenler skordan; ilk yarı maddeleri değerlendirme kaydındaki
 * `extendedHits`'ten (`<anahtar>Hit` = olasılık ≥ %50 yönünün isabeti → olay gerçekleşti mi'ye çevrilir).
 * Bilinmiyorsa null (oranda sayılmaz).
 */
export function topPickHit(
  pick: TopPick,
  score: { home: number; away: number } | null,
  extendedHits?: Record<string, boolean | null> | null,
): boolean | null {
  if (score) {
    const { home: h, away: a } = score;
    switch (pick.key) {
      case 'home':
        return h > a;
      case 'draw':
        return h === a;
      case 'away':
        return a > h;
      case 'over15':
        return h + a >= 2;
      case 'over25':
        return h + a >= 3;
      case 'over35':
        return h + a >= 4;
      case 'btts':
        return h > 0 && a > 0;
      case 'homeToScore':
        return h > 0;
      case 'awayToScore':
        return a > 0;
      default:
        break;
    }
  }
  const directionHit = extendedHits?.[`${pick.key}Hit`];
  if (typeof directionHit !== 'boolean') return null;
  // Kayıttaki isabet, olasılık ≥ %50 ise "olur", değilse "olmaz" yönünün isabetidir → olay gerçekleşti mi?
  return pick.pct >= 50 ? directionHit : !directionHit;
}
