/**
 * AI olasılık kalibrasyon tablosu (büyüme raporu 1.4) — SALT OKUNUR veritabanı, yazdığı tek şey repo dosyası:
 *   npx tsx --env-file=.env.local scripts/ai-kalibrasyon-tablo.ts
 * → src/config/aiCalibrationMap.json (commit'lenir; yeni analizler kaydedilirken kullanılır).
 *
 * Kaynak: değerlendirilmiş, prompt v5+ maç öncesi analizler. Her pazar için (ham olasılık, olay gerçekleşti mi)
 * noktaları → isotonic eğri. Ham olasılık: kalibrasyon sonrası kayıtlarda `fullReport.rawProbabilities`, öncekilerde
 * saklı değer. Pazar başına en az MIN_PER_MARKET nokta yoksa pazar eğrisi yazılmaz (global eğri kullanılır).
 * Ayda bir yeniden üretilmesi önerilir (aylık isabet raporuyla birlikte).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { AI_STATS_MIN_PROMPT_VERSION, promptVersion, recordOutcomes } from '../src/lib/loadAiStatsDashboard';
import { fitIsotonic, GOAL_KEYS, RESULT_KEYS, type CalibrationMap, type CurvePoint } from '../src/utils/probabilityCalibration';
import type { TopPickKey } from '../src/utils/analysisTopPicks';

const MIN_PER_MARKET = 150;
const OUT = path.resolve(__dirname, '../src/config/aiCalibrationMap.json');

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.predictionRecord.findMany({
    where: { evaluatedAt: { not: null }, matchAnalysis: { matchStatus: { not: 'HT' } } },
    select: {
      modelVersion: true,
      actualScore: true,
      extendedHits: true,
      matchAnalysis: { select: { homeTeamName: true, awayTeamName: true, competitionId: true, matchPrediction: true, goalExpectation: true, fullReport: true } },
    },
  });
  await prisma.$disconnect();
  const records = rows.filter((r) => promptVersion(r.modelVersion) >= AI_STATS_MIN_PROMPT_VERSION);

  const points = new Map<TopPickKey, { x: number; y: number }[]>();
  const base = new Map<TopPickKey, { yes: number; n: number }>();
  for (const r of records) {
    const outcomes = recordOutcomes(r as never);
    const raw = (r.matchAnalysis.fullReport as { rawProbabilities?: { matchPrediction?: Record<string, unknown>; goalExpectation?: Record<string, unknown> } } | null)?.rawProbabilities;
    const mp = (raw?.matchPrediction ?? r.matchAnalysis.matchPrediction ?? {}) as Record<string, unknown>;
    const ge = (raw?.goalExpectation ?? r.matchAnalysis.goalExpectation ?? {}) as Record<string, unknown>;
    for (const key of [...RESULT_KEYS, ...GOAL_KEYS] as TopPickKey[]) {
      const happened = outcomes[key];
      if (typeof happened !== 'boolean') continue;
      const b = base.get(key) ?? { yes: 0, n: 0 };
      b.n += 1;
      if (happened) b.yes += 1;
      base.set(key, b);
      const x = Number((RESULT_KEYS as readonly string[]).includes(key) ? mp[key] : ge[key]);
      if (!Number.isFinite(x)) continue;
      points.set(key, [...(points.get(key) ?? []), { x, y: happened ? 1 : 0 }]);
    }
  }

  const curves: CalibrationMap['curves'] = {};
  for (const [key, pts] of points) if (pts.length >= MIN_PER_MARKET) curves[key] = fitIsotonic(pts);
  const global: CurvePoint[] = fitIsotonic([...points.values()].flat());
  const baseRates: CalibrationMap['baseRates'] = Object.fromEntries([...base].map(([k, b]) => [k, Math.round((b.yes / b.n) * 1000) / 10]));

  const map: CalibrationMap = {
    version: `iso-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    matches: records.length,
    baseRates,
    curves,
    global,
  };
  writeFileSync(OUT, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`${records.length} maç · ${Object.keys(curves).length} pazar eğrisi · global ${global.length} nokta → ${path.relative(process.cwd(), OUT)}`);
  for (const [k, c] of Object.entries(curves)) console.log(`  ${k.padEnd(14)} ${c!.map(([x, y]) => `${x}→${y}`).join('  ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
