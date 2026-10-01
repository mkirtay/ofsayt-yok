import { parseScore } from './parseScore';

export type GoalSide = 'home' | 'away';

/** Gol anı animasyonu için: maç id → (golü atan taraf, animasyonu tek seferlik kılan anahtar). */
export type GoalEvent = { side: GoalSide; key: string };

/**
 * İki yenileme arasında skoru ARTAN maçlar (06 · Gol anı). Yalnız önceki skoru bilinen maçlar: ilk yüklemede,
 * listeye yeni giren maçta ya da skor okunamazsa olay yok. İki taraf birden arttıysa ev sahibi taraf seçilir.
 */
export function detectGoals(
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): Map<string, GoalEvent> {
  const goals = new Map<string, GoalEvent>();
  for (const [id, score] of next) {
    const before = parseScore(previous.get(id));
    const after = parseScore(score);
    if (!before || !after) continue;
    const homeUp = after[0] > before[0];
    const awayUp = after[1] > before[1];
    if (!homeUp && !awayUp) continue;
    goals.set(id, { side: homeUp ? 'home' : 'away', key: `${id}:${after[0]}-${after[1]}` });
  }
  return goals;
}
