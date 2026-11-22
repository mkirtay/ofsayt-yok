/**
 * Kilidin yanındaki kanıt (büyüme raporu 1.6): "Son 7 günde öne çıkan tahminlerin X/Y'si tuttu". Değerlendirilmiş,
 * prompt v5+ maç öncesi analizler; isabet sayfasıyla aynı seçim (lib/loadAiStatsDashboard.ts `recordTopPicks`).
 * Örnek azsa (< MIN_PICKS) gösterilmez. Süreç içi 30 dk önbellek (kilitli her istekte DB taraması olmasın).
 */
import { prisma } from '@/lib/prisma';
import { AI_STATS_MIN_PROMPT_VERSION, promptVersion, recordTopPicks, type RecordRow } from '@/lib/loadAiStatsDashboard';

export type RecentProof = { hits: number; picks: number; matches: number; days: number };

export const PROOF_DAYS = 7;
export const MIN_PICKS = 12;
const TTL_MS = 30 * 60_000;
let cache: { at: number; value: RecentProof | null } | null = null;

export async function loadRecentProof(now: number = Date.now()): Promise<RecentProof | null> {
  if (cache && now - cache.at < TTL_MS) return cache.value;
  let value: RecentProof | null = null;
  try {
    const rows: RecordRow[] = await prisma.predictionRecord.findMany({
      where: { evaluatedAt: { gte: new Date(now - PROOF_DAYS * 86_400_000) }, matchAnalysis: { matchStatus: { not: 'HT' } } },
      select: {
        evaluatedAt: true,
        matchId: true,
        modelVersion: true,
        actualResult: true,
        actualScore: true,
        extendedHits: true,
        createdAt: true,
        matchAnalysis: { select: { homeTeamName: true, awayTeamName: true, competitionId: true, matchPrediction: true, goalExpectation: true, fullReport: true } },
      },
    });
    let hits = 0;
    let picks = 0;
    let matches = 0;
    for (const r of rows) {
      if (promptVersion(r.modelVersion) < AI_STATS_MIN_PROMPT_VERSION) continue;
      const known = recordTopPicks(r).filter((p) => p.hit != null);
      if (!known.length) continue;
      matches += 1;
      picks += known.length;
      hits += known.filter((p) => p.hit).length;
    }
    value = picks >= MIN_PICKS ? { hits, picks, matches, days: PROOF_DAYS } : null;
  } catch {
    value = null; // kanıt yoksa kart yine çalışır
  }
  cache = { at: now, value };
  return value;
}

/** Test yardımcısı. */
export function resetRecentProofCache(): void {
  cache = null;
}
