/**
 * Kombine aracı: günün adayları + AI isabet geçmişi (YALNIZ admin). Adaylar: günün maçları (Sportmonks listesi) ∩ kayıtlı
 * maç öncesi AI analizi (prompt v5+) — yalnız kombine pazarları (comboMarkets.ts); maç başına tek seçim. AI üretimi / Sportmonks çağrısı eklemez:
 * liste zaten ana sayfanın paylaşımlı önbelleğinden, analizler DB'den okunur.
 */
import { prisma } from '@/lib/prisma';
import { loadHomeDay } from '@/server/homeDay';
import { AI_STATS_MIN_PROMPT_VERSION, promptVersion } from '@/lib/loadAiStatsDashboard';
import { matchKickoffMs } from '@/utils/matchActivity';
import { bestComboPickOfMatch, calibrationBands, type CalibrationBand, type ComboCandidate } from '@/utils/comboPicks';
import { parseScore, pickTopPredictions, topPickHit } from '@/utils/analysisTopPicks';
import type { Match } from '@/models/liveScore';
import { selectPool } from '@/config/comboPool';
import { matchToPoolInput, loadPoolContext } from '@/server/combo/pool';
import { loadTestAnalyses, type TestAnalysis } from '@/server/combo/testAnalyses';
import { toAfId } from '@/services/apiFootball/ids';
import { comboMarketPcts, type ComboMarketKey } from '@/utils/comboMarkets';

export type ComboCandidateRow = ComboCandidate & {
  homeName: string;
  awayName: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** `test`: geliştirme-özel JSON dosyasından (kayıtlı analiz değil); arayüzde "Test verisi" etiketi. */
  source: 'db' | 'test';
  national: boolean;
  /** Havuz önem puanı (kapsam kuralı). */
  poolScore: number;
  /** Modelin sekiz kombine pazarındaki olasılığı (günlük kuponlar piyasa ile harmanlar). */
  markets: Array<{ key: ComboMarketKey; pct: number }>;
};

function teamName(m: Match, side: 'home' | 'away'): string {
  return (side === 'home' ? m.home_name ?? m.home?.name : m.away_name ?? m.away?.name) ?? '';
}

export type CandidateOpts = {
  includePast?: boolean;
  now?: number;
  /** Yalnız otomatik havuzdaki maçlar (varsayılan: evet). */
  poolOnly?: boolean;
  /** Test için enjekte. */
  testAnalyses?: () => Promise<TestAnalysis[]>;
};

/**
 * Günün adayları: gün maçları ∩ otomatik havuz (config/comboPool.ts) ∩ analizi olanlar. Analiz kaynağı: kayıtlı maç öncesi analiz
 * (Sportmonks maçları, prompt v5+); geliştirmede ayrıca test dosyası (`server/combo/testAnalyses.ts`, aynı matchId'de KAYITLI olan önce
 * gelir). Milli maçların kayıtlı analizi (ön üretim, NATIONAL_ANALYSIS bayrağı) da okunur; yoksa yalnız test verisiyle aday olur.
 */
export async function loadComboCandidates(date: string, opts: CandidateOpts = {}): Promise<ComboCandidateRow[]> {
  const now = opts.now ?? Date.now();
  const day = await loadHomeDay(date);
  const upcoming = opts.includePast ? day.fixtureMatches : day.fixtureMatches.filter((m) => (matchKickoffMs(m) ?? 0) > now);
  if (upcoming.length === 0) return [];

  const inputs = upcoming.map((m) => matchToPoolInput(m));
  const poolIds = new Map<string, number>();
  if (opts.poolOnly === false) inputs.forEach((i) => poolIds.set(i.matchId, 0));
  else {
    const ctx = await loadPoolContext(inputs);
    for (const p of selectPool(inputs, ctx)) poolIds.set(p.matchId, p.score);
  }
  const byId = new Map(upcoming.filter((m) => poolIds.has(String(m.id))).map((m) => [String(m.id), m] as const));
  if (byId.size === 0) return [];

  const ids = [...byId.keys()];
  const analyses = ids.length
    ? await prisma.matchAnalysis.findMany({
        where: { matchId: { in: ids }, matchStatus: 'PRE' },
        select: { matchId: true, modelVersion: true, matchPrediction: true, goalExpectation: true },
      })
    : [];
  const tests = await (opts.testAnalyses ?? (() => loadTestAnalyses()))();

  type Src = { matchId: string; prediction: unknown; goals: unknown; source: 'db' | 'test' };
  const sources = new Map<string, Src>();
  for (const a of analyses) {
    if (promptVersion(a.modelVersion) < AI_STATS_MIN_PROMPT_VERSION) continue;
    sources.set(a.matchId, { matchId: a.matchId, prediction: a.matchPrediction, goals: a.goalExpectation, source: 'db' });
  }
  for (const t of tests) if (!sources.has(t.matchId)) sources.set(t.matchId, { matchId: t.matchId, prediction: t.matchPrediction, goals: t.goalExpectation, source: 'test' });

  const rows: ComboCandidateRow[] = [];
  for (const src of sources.values()) {
    const m = byId.get(src.matchId);
    if (!m) continue;
    const analysis = { matchPrediction: src.prediction as never, goalExpectation: src.goals as never };
    const best = bestComboPickOfMatch(analysis);
    if (!best) continue;
    const kick = matchKickoffMs(m);
    const home = teamName(m, 'home');
    const away = teamName(m, 'away');
    rows.push({
      matchId: src.matchId,
      label: `${home} – ${away}`,
      homeName: home,
      awayName: away,
      homeLogo: m.home?.logo ?? null,
      awayLogo: m.away?.logo ?? null,
      competition: m.competition?.name ?? m.competition_name ?? null,
      kickoffIso: kick != null ? new Date(kick).toISOString() : null,
      key: best.key,
      pct: best.pct,
      source: src.source,
      national: toAfId(src.matchId) != null,
      poolScore: poolIds.get(src.matchId) ?? 0,
      markets: comboMarketPcts(analysis),
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
