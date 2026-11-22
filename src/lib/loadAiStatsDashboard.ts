import { prisma } from '@/lib/prisma';
import type { Role } from '@prisma/client';
import { isUnresolvedActualResult } from '@/lib/predictionRecords';
import { readCronHeartbeats, type AiCronJobName, type CronHeartbeat } from '@/server/cronJobs';
import { parseScore, pickTopPredictions, topPickHit, type TopPickKey } from '@/utils/analysisTopPicks';
import {
  COMPETITION_GROUPS,
  competitionGroup,
  computeCalibration,
  expectedBaseRate,
  marketBaseRates,
  type AiCalibration,
  type CalibrationMatch,
  type CompetitionGroup,
} from '@/utils/aiCalibration';

/**
 * AI isabet sayfası (/ai-istatistikleri). Ölçü: her analiz kartının üstündeki "en güçlü 3 tahmin" rozetinin
 * gerçekleşme oranı (kartta görünenle birebir aynı seçim — utils/analysisTopPicks.ts). Maç sonucu (1X2) isabeti
 * 2026-10-21'den beri gösterilmiyor (kullanıcı kararı); değerlendirme kaydında durur.
 *
 * Kapsam: yalnız güncel model ailesi (prompt v5+, 2026-10-03'ten beri). Daha eski kayıtlar (v1 Claude / v2 GPT-4.1)
 * başka bir modelle ve çoğu eski veri sağlayıcısının maçlarıyla (sayfası "artık sağlayıcıda yok" arşiv görünümü:
 * Dünya Kupası, Brezilya Serie B …) üretildi — sayfada sayılmaz, listelenmez.
 */
export const AI_STATS_MIN_PROMPT_VERSION = 5;

/** "v6-2026-10-openai:gpt-6-luna" → 6; tanınmazsa 0 (sayılmaz). */
export function promptVersion(modelVersion: string): number {
  const m = /^v(\d+)-/.exec(modelVersion);
  return m ? Number(m[1]) : 0;
}

export type AiStatsHistoryItem = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  /** Maçın gerçek sonucu (HOME / DRAW / AWAY); değerlendirilmemişse null. */
  actualResult: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  /** Analiz kartındaki "en güçlü 3 tahmin" rozetleri ve tutup tutmadığı (değerlendirilmemişse `hit` null). */
  topPicks: { key: TopPickKey; pct: number; hit: boolean | null }[];
};

/** "En güçlü 3 tahmin" isabeti: değerlendirilmiş analizlerin kart rozetleri (bilinmeyenler sayılmaz). */
export type TopPickStats = { matches: number; picks: number; hits: number; rate: number };

/** Ay bazında isabet (analiz ayı, Türkiye saati; "2026-11"). Yalnız değerlendirilmiş analizler. */
export type AiStatsMonth = TopPickStats & {
  month: string;
  /** O ayın rozetleri için temel oran (%): aynı pazarlar hep söylenseydi beklenen isabet. Bkz. utils/aiCalibration.ts. */
  baseRate: number | null;
};

export type AiStatsDashboard = {
  totalRecords: number;
  totalEvaluated: number;
  pendingCount: number;
  topPicks: TopPickStats;
  isAdmin: boolean;
  /** Yalnız yönetici: zamanlanmış işlerin son çalışması (admin bandı). */
  cronStatus?: Record<AiCronJobName, CronHeartbeat | null>;
  history: AiStatsHistoryItem[];
  /** Yeni ay önce (SEO/GEO: aylık isabet raporu, /ai-istatistikleri/rapor/{ay}). */
  monthly: AiStatsMonth[];
  /** Temel orana karşı + kalibrasyon (yalnız değerlendirilmiş analizler); veri yoksa null. */
  calibration: AiCalibration | null;
  /** Turnuva grubuna göre isabet + temel oran (boş gruplar yok); sabit sırada. */
  byCompetition: AiStatsCompetitionGroup[];
};

export type AiStatsCompetitionGroup = TopPickStats & { group: CompetitionGroup; baseRate: number | null };

type RecordRow = {
  evaluatedAt: Date | null;
  matchId: string;
  modelVersion: string;
  actualResult: string | null;
  actualScore: string | null;
  extendedHits: unknown;
  createdAt: Date;
  matchAnalysis: {
    homeTeamName: string;
    awayTeamName: string;
    competitionId: string | null;
    matchPrediction: unknown;
    goalExpectation: unknown;
  };
};

type ProbSource = Parameters<typeof pickTopPredictions>[0];

/** Kayıt → kart rozetleri + isabet. Gerçek skor yalnız burada okunur; yanıta yazılmaz. */
function recordTopPicks(r: RecordRow): AiStatsHistoryItem['topPicks'] {
  const picks = pickTopPredictions({
    matchPrediction: r.matchAnalysis.matchPrediction as ProbSource['matchPrediction'],
    goalExpectation: r.matchAnalysis.goalExpectation as ProbSource['goalExpectation'],
  });
  if (r.evaluatedAt == null) return picks.map((p) => ({ ...p, hit: null }));
  const score = parseScore(r.actualScore);
  const hits = (r.extendedHits ?? null) as Record<string, boolean | null> | null;
  return picks.map((p) => ({ ...p, hit: topPickHit(p, score, hits) }));
}

const ALL_MARKETS: TopPickKey[] = ['home', 'draw', 'away', 'over15', 'over25', 'over35', 'btts', 'htOver05', 'htOver15', 'homeToScore', 'awayToScore', 'bttsFirstHalf'];

/**
 * Değerlendirilmiş kaydın bütün pazar sonuçları (olay gerçekleşti mi) — temel oran için, model o pazarı seçmese de.
 * Skordan çıkmayan ilk yarı pazarları kayıttaki yön isabetinden; yönü çevirmek için o pazarın kart olasılığı gerekir.
 */
function recordOutcomes(r: RecordRow): CalibrationMatch['outcomes'] {
  const score = parseScore(r.actualScore);
  const hits = (r.extendedHits ?? null) as Record<string, boolean | null> | null;
  const mp = (r.matchAnalysis.matchPrediction ?? {}) as Record<string, unknown>;
  const ge = (r.matchAnalysis.goalExpectation ?? {}) as Record<string, unknown>;
  const out: CalibrationMatch['outcomes'] = {};
  for (const key of ALL_MARKETS) {
    const pct = Number((key === 'home' || key === 'draw' || key === 'away' ? mp : ge)[key]);
    const hit = topPickHit({ key, pct: Number.isFinite(pct) ? pct : 50 }, score, hits);
    if (hit != null) out[key] = hit;
  }
  return out;
}

const monthFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' });
/** Date → "2026-11" (Türkiye saati). */
export function istanbulMonth(d: Date): string {
  return monthFmt.format(d).slice(0, 7);
}

/** Bir ayın değerlendirilmiş analizleri (aylık rapor sayfası; yalnız herkese açık görünüm). */
export async function loadAiMonthlyReport(month: string): Promise<{ stats: AiStatsMonth | null; items: AiStatsHistoryItem[] }> {
  const all = await loadAiStatsDashboard({ role: null }, { historyLimit: Infinity });
  return {
    stats: all.monthly.find((m) => m.month === month) ?? null,
    items: all.history.filter((h) => istanbulMonth(new Date(h.createdAt)) === month),
  };
}

export async function loadAiStatsDashboard(auth: { role: Role | null }, opts: { historyLimit?: number } = {}): Promise<AiStatsDashboard> {
  const isAdmin = auth.role === 'ADMIN';

  const rows: RecordRow[] = await prisma.predictionRecord.findMany({
    // Maç öncesi analizler (devre arası analizleri aynı olasılıkları tekrarlar; sayfada ayrıca sayılmaz).
    where: { matchAnalysis: { matchStatus: { not: 'HT' } } },
    select: {
      evaluatedAt: true,
      matchId: true,
      modelVersion: true,
      actualResult: true,
      actualScore: true,
      extendedHits: true,
      createdAt: true,
      matchAnalysis: {
        select: { homeTeamName: true, awayTeamName: true, competitionId: true, matchPrediction: true, goalExpectation: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const records = rows.filter((r) => promptVersion(r.modelVersion) >= AI_STATS_MIN_PROMPT_VERSION);

  const evaluated = records.filter((r) => r.evaluatedAt != null);
  // "Çözülemedi" diye kapatılanlar (evaluatedAt boş) bekleyen sayılmaz — bkz. predictionRecords.ts.
  const pendingCount = records.filter(
    (r) => r.evaluatedAt == null && !isUnresolvedActualResult(r.actualResult),
  ).length;

  const picksByRecord = new Map(records.map((r) => [r, recordTopPicks(r)] as const));
  let picks = 0;
  let hits = 0;
  let matches = 0;
  for (const r of evaluated) {
    const known = (picksByRecord.get(r) ?? []).filter((p) => p.hit != null);
    if (known.length === 0) continue;
    matches += 1;
    picks += known.length;
    hits += known.filter((p) => p.hit).length;
  }

  // Kredi modeli v2: oynanmamış maçın kartı kilitli analiz içeriği → herkese açık geçmişte yalnız değerlendirilmiş
  // (bitmiş) maçlar; bekleyenler yalnız sayı olarak (pendingCount). Yönetici hepsini görür.
  const historySource = isAdmin ? records : evaluated;
  const history: AiStatsHistoryItem[] = historySource.slice(0, opts.historyLimit ?? 100).map((r) => ({
    matchId: r.matchId,
    homeTeamName: r.matchAnalysis.homeTeamName,
    awayTeamName: r.matchAnalysis.awayTeamName,
    actualResult: r.evaluatedAt ? r.actualResult : null,
    evaluatedAt: r.evaluatedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    topPicks: picksByRecord.get(r) ?? [],
  }));

  const byMonth = new Map<string, TopPickStats>();
  for (const r of evaluated) {
    const known = (picksByRecord.get(r) ?? []).filter((p) => p.hit != null);
    if (known.length === 0) continue;
    const key = istanbulMonth(r.createdAt);
    const m = byMonth.get(key) ?? { matches: 0, picks: 0, hits: 0, rate: 0 };
    m.matches += 1;
    m.picks += known.length;
    m.hits += known.filter((p) => p.hit).length;
    byMonth.set(key, m);
  }
  const calMatches: CalibrationMatch[] = evaluated.map((r) => ({ picks: picksByRecord.get(r) ?? [], outcomes: recordOutcomes(r) }));
  const base = marketBaseRates(calMatches);
  const monthPicks = new Map<string, AiStatsHistoryItem['topPicks']>();
  for (const r of evaluated) {
    const key = istanbulMonth(r.createdAt);
    monthPicks.set(key, [...(monthPicks.get(key) ?? []), ...(picksByRecord.get(r) ?? [])]);
  }
  const monthly: AiStatsMonth[] = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, m]) => ({
      month,
      ...m,
      rate: m.picks > 0 ? Math.round((m.hits / m.picks) * 1000) / 10 : 0,
      baseRate: expectedBaseRate(monthPicks.get(month) ?? [], base),
    }));

  const byGroup = new Map<CompetitionGroup, { stats: TopPickStats; picks: AiStatsHistoryItem['topPicks'] }>();
  for (const r of evaluated) {
    const known = (picksByRecord.get(r) ?? []).filter((p) => p.hit != null);
    if (known.length === 0) continue;
    const g = competitionGroup(r.matchAnalysis.competitionId, r.matchId);
    const e = byGroup.get(g) ?? { stats: { matches: 0, picks: 0, hits: 0, rate: 0 }, picks: [] };
    e.stats.matches += 1;
    e.stats.picks += known.length;
    e.stats.hits += known.filter((p) => p.hit).length;
    e.picks.push(...known);
    byGroup.set(g, e);
  }
  const byCompetition: AiStatsCompetitionGroup[] = COMPETITION_GROUPS.filter((g) => byGroup.has(g)).map((g) => {
    const e = byGroup.get(g)!;
    return {
      group: g,
      ...e.stats,
      rate: e.stats.picks > 0 ? Math.round((e.stats.hits / e.stats.picks) * 1000) / 10 : 0,
      baseRate: expectedBaseRate(e.picks, base),
    };
  });

  return {
    monthly,
    byCompetition,
    calibration: computeCalibration(calMatches),
    totalRecords: records.length,
    totalEvaluated: evaluated.length,
    pendingCount,
    topPicks: { matches, picks, hits, rate: picks > 0 ? Math.round((hits / picks) * 1000) / 10 : 0 },
    isAdmin,
    ...(isAdmin ? { cronStatus: await readCronHeartbeats() } : {}),
    history,
  };
}
