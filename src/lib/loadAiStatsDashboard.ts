import { prisma } from '@/lib/prisma';
import type { Role } from '@prisma/client';
import { UNRESOLVED_ACTUAL_RESULT } from '@/lib/predictionRecords';
import { readCronHeartbeats, type AiCronJobName, type CronHeartbeat } from '@/server/cronJobs';
import { parseScore, pickTopPredictions, topPickHit, type TopPickKey } from '@/utils/analysisTopPicks';

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

export type AiStatsDashboard = {
  totalRecords: number;
  totalEvaluated: number;
  pendingCount: number;
  topPicks: TopPickStats;
  isAdmin: boolean;
  /** Yalnız yönetici: zamanlanmış işlerin son çalışması (admin bandı). */
  cronStatus?: Record<AiCronJobName, CronHeartbeat | null>;
  history: AiStatsHistoryItem[];
};

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

export async function loadAiStatsDashboard(auth: { role: Role | null }): Promise<AiStatsDashboard> {
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
        select: { homeTeamName: true, awayTeamName: true, matchPrediction: true, goalExpectation: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const records = rows.filter((r) => promptVersion(r.modelVersion) >= AI_STATS_MIN_PROMPT_VERSION);

  const evaluated = records.filter((r) => r.evaluatedAt != null);
  // "Çözülemedi" diye kapatılanlar (evaluatedAt boş) bekleyen sayılmaz — bkz. predictionRecords.ts.
  const pendingCount = records.filter(
    (r) => r.evaluatedAt == null && r.actualResult !== UNRESOLVED_ACTUAL_RESULT,
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
  const history: AiStatsHistoryItem[] = historySource.slice(0, 100).map((r) => ({
    matchId: r.matchId,
    homeTeamName: r.matchAnalysis.homeTeamName,
    awayTeamName: r.matchAnalysis.awayTeamName,
    actualResult: r.evaluatedAt ? r.actualResult : null,
    evaluatedAt: r.evaluatedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    topPicks: picksByRecord.get(r) ?? [],
  }));

  return {
    totalRecords: records.length,
    totalEvaluated: evaluated.length,
    pendingCount,
    topPicks: { matches, picks, hits, rate: picks > 0 ? Math.round((hits / picks) * 1000) / 10 : 0 },
    isAdmin,
    ...(isAdmin ? { cronStatus: await readCronHeartbeats() } : {}),
    history,
  };
}
