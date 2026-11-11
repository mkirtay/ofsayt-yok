/**
 * SALT OKUNUR: kombine pazarlarında (1,5 / 2,5 / 3,5 alt-üst, iki takım da gol bulur var/yok) AI modelinin kalibrasyonu.
 * Değerlendirilmiş maç öncesi analizler (prompt v5+) + gerçek skor → pazar başına: örnek, ortalama tahmin, gerçekleşme,
 * Brier skoru, taban çizgisine göre beceri (sabit taban oranı tahmini) ve olasılık bantları.
 * Çalıştırma (.env.local prod DB'ye bağlıdır; yalnız SELECT):
 *   npx dotenv -e .env.local -- npx tsx scripts/combo-kalibrasyon.ts
 */
import { prisma } from '../src/lib/prisma';
import { AI_STATS_MIN_PROMPT_VERSION, promptVersion } from '../src/lib/loadAiStatsDashboard';
import { parseScore } from '../src/utils/analysisTopPicks';
import { COMBO_MARKETS, comboMarketHit, comboMarketPcts } from '../src/utils/comboMarkets';

type Pt = { p: number; y: number };

(async () => {
  const rows = await prisma.predictionRecord.findMany({
    where: { evaluatedAt: { not: null }, actualScore: { not: null }, matchAnalysis: { matchStatus: 'PRE' } },
    select: { modelVersion: true, actualScore: true, matchAnalysis: { select: { goalExpectation: true } } },
  });
  const pts = new Map<string, Pt[]>(COMBO_MARKETS.map((k) => [k, []]));
  let used = 0;
  for (const r of rows) {
    if (promptVersion(r.modelVersion) < AI_STATS_MIN_PROMPT_VERSION) continue;
    const score = parseScore(r.actualScore);
    if (!score) continue;
    const markets = comboMarketPcts({ goalExpectation: r.matchAnalysis.goalExpectation as never });
    if (markets.length === 0) continue;
    used += 1;
    for (const m of markets) {
      const hit = comboMarketHit(m.key, score);
      if (hit == null) continue;
      pts.get(m.key)!.push({ p: m.pct / 100, y: hit ? 1 : 0 });
    }
  }
  console.log(`değerlendirilmiş maç (v${AI_STATS_MIN_PROMPT_VERSION}+): ${used}`);
  const f = (x: number) => (x * 100).toFixed(1).padStart(5);
  for (const [key, list] of pts) {
    if (list.length === 0) continue;
    const n = list.length;
    const meanP = list.reduce((s, x) => s + x.p, 0) / n;
    const rate = list.reduce((s, x) => s + x.y, 0) / n;
    const brier = list.reduce((s, x) => s + (x.p - x.y) ** 2, 0) / n;
    const base = list.reduce((s, x) => s + (rate - x.y) ** 2, 0) / n;
    const skill = base > 0 ? 1 - brier / base : 0;
    console.log(`\n${key.padEnd(8)} n=${n}  tahmin ort %${f(meanP)}  gerçek %${f(rate)}  Brier ${brier.toFixed(4)}  taban ${base.toFixed(4)}  beceri ${(skill * 100).toFixed(1)}%`);
    for (const [lo, hi] of [[0, 40], [40, 50], [50, 60], [60, 70], [70, 80], [80, 101]] as const) {
      const b = list.filter((x) => x.p * 100 >= lo && x.p * 100 < hi);
      if (b.length === 0) continue;
      const bp = b.reduce((s, x) => s + x.p, 0) / b.length;
      const by = b.reduce((s, x) => s + x.y, 0) / b.length;
      console.log(`   %${String(lo).padStart(2)}–${hi > 100 ? 100 : hi}: n=${String(b.length).padStart(4)}  tahmin %${f(bp)}  gerçek %${f(by)}  fark ${((by - bp) * 100).toFixed(1)}`);
    }
  }
  await prisma.$disconnect();
})();
