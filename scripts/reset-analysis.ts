/**
 * Ofsayt Yok — AI Analiz Sıfırlama / Yeniden Üretme CLI
 *
 * Belirli maçların önbelleklenmiş (PRE fazı) AI analizini SİLER ve yeni şema
 * ile (ör. ısı haritası zoneGrid) YENİDEN ÜRETİR. Siteden bağımsız çalışır —
 * kredi harcamaz, giriş gerektirmez. Gerçek OpenAI/Anthropic API çağrısı ve
 * gerçek üretim veritabanı yazımı yapar — GERİ ALINAMAZ.
 *
 * Yalnızca hâlâ PRE (henüz başlamamış) fazdaki maçlarda çalışır; maç
 * başladıysa/bittiyse o maç atlanır (siteyle aynı kural).
 *
 * Kullanım:
 *   npm run analysis:reset                         (varsayılan: bugünkü 3 Dünya Kupası çeyrek finali)
 *   npm run analysis:reset -- 1853411 1853412       (belirli matchId'ler)
 */
import { prisma } from '@/lib/prisma';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { generateMatchAnalysis } from '@/services/aiAnalysisService';
import { livescoreServerClient } from '@/server/livescoreInternalAxios';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { ensurePredictionRecordForAnalysis } from '@/lib/predictionRecords';
import type { Prisma } from '@prisma/client';

// 2026 Dünya Kupası çeyrek finalleri (henüz oynanmamış 3 maç) — varsayılan liste.
const DEFAULT_MATCH_IDS = ['1853411', '1853412', '1853413'];

async function resetOne(matchId: string): Promise<void> {
  console.log(`\n─── ${matchId} ───────────────────────────`);

  const ctx = await buildMatchAnalysisContext(matchId);
  if (!ctx) {
    console.log(`  ATLANDI: maç bulunamadı.`);
    return;
  }

  const label = `${ctx.homeTeam.teamName} - ${ctx.awayTeam.teamName}`;

  if (ctx.matchPhase !== 'PRE') {
    console.log(`  ATLANDI: ${label} artık PRE fazında değil (${ctx.matchPhase}). Bu maç için yeniden üretim yapılamaz.`);
    return;
  }

  console.log(`  ${label} — mevcut PRE analizi siliniyor...`);
  await prisma.matchAnalysis.deleteMany({
    where: { matchId, matchStatus: 'PRE' },
  });

  console.log(`  Yeni analiz üretiliyor (LLM çağrısı)...`);
  const ai = await generateMatchAnalysis(ctx);

  const saved = await prisma.matchAnalysis.create({
    data: {
      matchId: String(ctx.match.id),
      matchStatus: 'PRE',
      homeTeamId: String(ctx.homeTeam.teamId),
      awayTeamId: String(ctx.awayTeam.teamId),
      homeTeamName: ctx.homeTeam.teamName,
      awayTeamName: ctx.awayTeam.teamName,
      competitionId: ctx.match.competition?.id ? String(ctx.match.competition.id) : null,
      competitionName: ctx.match.competition?.name ?? null,
      homeTeamNarrative: ai.analysis.teamAnalyses.home.narrative,
      awayTeamNarrative: ai.analysis.teamAnalyses.away.narrative,
      matchPrediction: ai.analysis.matchPrediction as unknown as Prisma.InputJsonValue,
      scorePrediction: ai.analysis.scorePrediction as unknown as Prisma.InputJsonValue,
      goalExpectation: ai.analysis.goalExpectation as unknown as Prisma.InputJsonValue,
      bettingTips: ai.analysis.bettingTips as unknown as Prisma.InputJsonValue,
      teamAnalyses: ai.analysis.teamAnalyses as unknown as Prisma.InputJsonValue,
      fullReport: {
        matchSummary: ai.analysis.matchSummary,
        tacticalAnalysis: ai.analysis.tacticalAnalysis,
        heatmapAnalysis: ai.analysis.heatmapAnalysis,
        riskFactors: ai.analysis.riskFactors,
        analystComment: ai.analysis.analystComment,
      } as unknown as Prisma.InputJsonValue,
      riskLevel: ai.analysis.riskLevel,
      riskReasoning: ai.analysis.riskReasoning,
      confidenceScore: ai.analysis.overallConfidence,
      modelVersion: ai.modelVersion,
      tokensUsed: ai.tokensUsed,
      expiresAt: null,
    },
  });

  await ensurePredictionRecordForAnalysis(saved);

  const hasZoneGrid = Boolean(
    (ai.analysis.heatmapAnalysis as { zoneGrid?: unknown })?.zoneGrid
  );
  console.log(
    `  ✓ Tamamlandı — model: ${ai.modelVersion} | token: ${ai.tokensUsed} | zoneGrid: ${hasZoneGrid ? 'VAR' : 'YOK (model üretmedi, tekrar denenebilir)'}`
  );
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const matchIds = args.length > 0 ? args : DEFAULT_MATCH_IDS;

  console.log(`Ofsayt Yok — Analiz Sıfırlama`);
  console.log(`Hedef maçlar: ${matchIds.join(', ')}`);

  const client = livescoreServerClient();
  await runWithLiveScoreHttpClient(client, async () => {
    for (const matchId of matchIds) {
      try {
        await resetOne(matchId);
      } catch (err) {
        console.error(`  HATA (${matchId}):`, err instanceof Error ? err.message : err);
      }
    }
  });

  console.log(`\nBitti.`);
}

main()
  .catch((err) => {
    console.error('\nKritik hata:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
