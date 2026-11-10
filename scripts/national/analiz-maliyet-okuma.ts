/**
 * SALT OKUNUR (tek sefer): AI analiz maliyeti ve aylık OpenAI bütçe kullanımı.
 * - DB: yalnız SELECT (MatchAnalysis.tokensUsed, günlük üretim sayısı).
 * - Redis: yalnız GET (prod:v2:llm:budget:<ay>).
 * Çalıştırma: npx dotenv -e ../../../.env.local -- npx tsx scripts/national/analiz-maliyet-okuma.ts
 */
import { Redis } from '@upstash/redis';
import { prisma } from '../../src/lib/prisma';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

(async () => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.matchAnalysis.findMany({
    where: { matchStatus: 'PRE', createdAt: { gte: since } },
    select: { createdAt: true, modelVersion: true, tokensUsed: true },
  });
  const byVer = new Map<string, number[]>();
  for (const r of rows) { const v = r.modelVersion.split('-openai')[0]!; byVer.set(v, [...(byVer.get(v) ?? []), r.tokensUsed]); }
  for (const [v, t] of byVer) console.log(`token ${v}: n=${t.length} ort=${Math.round(t.reduce((a, b) => a + b, 0) / t.length)} medyan=${pct(t, 0.5)} p95=${pct(t, 0.95)} max=${Math.max(...t)}`);
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(fmt.format(r.createdAt), (byDay.get(fmt.format(r.createdAt)) ?? 0) + 1);
  console.log('günlük üretim (30 gün):', [...byDay].sort().map(([d, n]) => `${d.slice(5)}:${n}`).join(' '));
  console.log('30 günde toplam PRE analiz:', rows.length);

  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const r = new Redis({ url, token });
    for (const m of ['2026-10', '2026-11']) {
      const v = Number((await r.get<number>(`prod:v2:llm:budget:${m}`)) ?? 0);
      console.log(`bütçe sayacı ${m}: ${(v / 1e6).toFixed(3)} USD (rezervasyonlar dahil, gerçekle kesinleşmiş)`);
    }
  }
  console.log('OPENAI_MONTHLY_BUDGET_USD (yerel env):', process.env.OPENAI_MONTHLY_BUDGET_USD ?? '(tanımsız → kod varsayılanı 30)');
  await prisma.$disconnect();
})();
