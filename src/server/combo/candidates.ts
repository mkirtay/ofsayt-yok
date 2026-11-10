/**
 * Kombine aracı: günün adayları + AI isabet geçmişi (YALNIZ admin). Adaylar: günün maçları (Sportmonks listesi) ∩ kayıtlı
 * maç öncesi AI analizi (prompt v5+) — her maçtan yalnız en güçlü tek pazar. AI üretimi / Sportmonks çağrısı eklemez:
 * liste zaten ana sayfanın paylaşımlı önbelleğinden, analizler DB'den okunur.
 */
import { prisma } from '@/lib/prisma';
import { loadHomeDay } from '@/server/homeDay';
import { AI_STATS_MIN_PROMPT_VERSION, promptVersion } from '@/lib/loadAiStatsDashboard';
import { matchKickoffMs } from '@/utils/matchActivity';
import { bestPickOfMatch, calibrationBands, type CalibrationBand, type ComboCandidate } from '@/utils/comboPicks';
import { parseScore, pickTopPredictions, topPickHit } from '@/utils/analysisTopPicks';
import type { Match } from '@/models/liveScore';

export type ComboCandidateRow = ComboCandidate & { homeName: string; awayName: string; homeLogo?: string | null; awayLogo?: string | null };

/** Ulusal (2e9+) maçlarda AI analizi yok; ayrıca Sportmonks kimliği değil. */
const NATIONAL_ID_FLOOR = 2_000_000_000;

function teamName(m: Match, side: 'home' | 'away'): string {
  return (side === 'home' ? m.home_name ?? m.home?.name : m.away_name ?? m.away?.name) ?? '';
}

export async function loadComboCandidates(date: string, opts: { includePast?: boolean; now?: number } = {}): Promise<ComboCandidateRow[]> {
  const now = opts.now ?? Date.now();
  const day = await loadHomeDay(date);
  const matches = day.fixtureMatches.filter((m) => Number(m.id) < NATIONAL_ID_FLOOR);
  const upcoming = opts.includePast ? matches : matches.filter((m) => (matchKickoffMs(m) ?? 0) > now);
  if (upcoming.length === 0) return [];
  const byId = new Map(upcoming.map((m) => [String(m.id), m] as const));

  const analyses = await prisma.matchAnalysis.findMany({
    where: { matchId: { in: [...byId.keys()] }, matchStatus: 'PRE' },
    select: { matchId: true, modelVersion: true, matchPrediction: true, goalExpectation: true },
  });

  const rows: ComboCandidateRow[] = [];
  for (const a of analyses) {
    if (promptVersion(a.modelVersion) < AI_STATS_MIN_PROMPT_VERSION) continue;
    const m = byId.get(a.matchId);
    if (!m) continue;
    const best = bestPickOfMatch({
      matchPrediction: a.matchPrediction as never,
      goalExpectation: a.goalExpectation as never,
    });
    if (!best) continue;
    const kick = matchKickoffMs(m);
    const home = teamName(m, 'home');
    const away = teamName(m, 'away');
    rows.push({
      matchId: a.matchId,
      label: `${home} – ${away}`,
      homeName: home,
      awayName: away,
      homeLogo: m.home?.logo ?? null,
      awayLogo: m.away?.logo ?? null,
      competition: m.competition?.name ?? m.competition_name ?? null,
      kickoffIso: kick != null ? new Date(kick).toISOString() : null,
      key: best.key,
      pct: best.pct,
    });
  }
  return rows.sort((x, y) => (x.kickoffIso ?? '').localeCompare(y.kickoffIso ?? '') || y.pct - x.pct);
}

export type ComboHistory = { evaluatedMatches: number; bands: CalibrationBand[]; sinceVersion: number };

/** Geçmiş isabet: değerlendirilmiş maçların EN GÜÇLÜ TEK pazarı, olasılık bantlarına göre (kombine aracının seçtiği pazar). */
export async function loadComboHistory(): Promise<ComboHistory> {
  const rows = await prisma.predictionRecord.findMany({
    where: { evaluatedAt: { not: null }, matchAnalysis: { matchStatus: { not: 'HT' } } },
    select: {
      modelVersion: true,
      actualScore: true,
      extendedHits: true,
      matchAnalysis: { select: { matchPrediction: true, goalExpectation: true } },
    },
  });
  const points: { pct: number; hit: boolean | null }[] = [];
  for (const r of rows) {
    if (promptVersion(r.modelVersion) < AI_STATS_MIN_PROMPT_VERSION) continue;
    const top = pickTopPredictions(
      { matchPrediction: r.matchAnalysis.matchPrediction as never, goalExpectation: r.matchAnalysis.goalExpectation as never },
      1,
    )[0];
    if (!top) continue;
    points.push({ pct: top.pct, hit: topPickHit(top, parseScore(r.actualScore), (r.extendedHits ?? null) as Record<string, boolean | null> | null) });
  }
  return { evaluatedMatches: points.filter((p) => p.hit != null).length, bands: calibrationBands(points), sinceVersion: AI_STATS_MIN_PROMPT_VERSION };
}
