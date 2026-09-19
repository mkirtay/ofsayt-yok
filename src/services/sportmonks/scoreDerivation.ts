/**
 * Sportmonks `scores[]` dizisinden mevcut `MatchScore` şeklini türetir.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 1 "getAllCompetitionHistoryMatches"
 * bölümü — `scores[]` `description` alanına göre (`1ST_HALF`/`2ND_HALF`/
 * `CURRENT`/`2ND_HALF_ONLY` gözlemlendi) gruplanıp home/away goals'ı
 * birleştirerek "2-1" gibi bir string üretilmesi gerektiğini belirtiyor.
 * `score.score.participant` zaten `'home'|'away'` taşıdığı için ayrıca bir
 * home/away takım id eşleştirmesine ihtiyaç yok.
 *
 * NOT: `CURRENT` içeren tam bir örnek maç raporda YOK (sadece "8 score
 * satırı" sayısı geçiyor, gol değerleri verilmiyor) — bu yüzden `score`/
 * `ft_score` dalı gerçek veriyle test edilemedi, bkz. scoreDerivation.test.ts
 * başındaki not.
 */
import type { MatchScore } from '@/models/liveScore';
import type { SportmonksScoreRow } from './types';

type GoalsByLocation = { home: number; away: number };

function sumByLocation(rows: SportmonksScoreRow[]): GoalsByLocation {
  const totals: GoalsByLocation = { home: 0, away: 0 };
  for (const row of rows) {
    totals[row.score.participant] += row.score.goals;
  }
  return totals;
}

function formatScore(goals: GoalsByLocation): string {
  return `${goals.home}-${goals.away}`;
}

function groupByDescription(rows: SportmonksScoreRow[]): Map<string, SportmonksScoreRow[]> {
  const map = new Map<string, SportmonksScoreRow[]>();
  for (const row of rows) {
    const bucket = map.get(row.description) ?? [];
    bucket.push(row);
    map.set(row.description, bucket);
  }
  return map;
}

/**
 * `scores[]`'ı gruplayıp mevcut `MatchScore` şeklini üretir.
 * Boş dizi veya hiçbir tanınan `description` yoksa `null` döner.
 */
export function deriveMatchScore(scores: SportmonksScoreRow[] | undefined | null): MatchScore | null {
  if (!scores || scores.length === 0) return null;

  const grouped = groupByDescription(scores);

  const current = grouped.get('CURRENT');
  const firstHalf = grouped.get('1ST_HALF');
  const secondHalf = grouped.get('2ND_HALF');

  const score = current ? formatScore(sumByLocation(current)) : undefined;
  const ht_score = firstHalf ? formatScore(sumByLocation(firstHalf)) : undefined;
  const ft_score = secondHalf ? formatScore(sumByLocation(secondHalf)) : (score ?? undefined);

  if (score === undefined && ht_score === undefined && ft_score === undefined) {
    return null;
  }

  // MatchScore.score zorunlu bir alan; CURRENT yoksa elimizdeki en güncel
  // bilgi (ft_score, o da yoksa ht_score) fallback olarak kullanılır.
  const resolvedScore = score ?? ft_score ?? ht_score;
  if (resolvedScore === undefined) return null;

  return {
    score: resolvedScore,
    ...(ht_score !== undefined ? { ht_score } : {}),
    ...(ft_score !== undefined ? { ft_score } : {}),
  };
}
