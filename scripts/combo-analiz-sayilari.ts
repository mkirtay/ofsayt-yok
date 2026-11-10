/**
 * SALT OKUNUR: son N günde kaç maçın maç öncesi (PRE) AI analizi var — kombine aracının aday havuzu ne kadar büyük?
 * Çalıştırma (kullanıcı; .env.local prod DB'ye bağlıdır, yalnız SELECT yapılır):
 *   npx dotenv -e .env.local -- npx tsx scripts/combo-analiz-sayilari.ts [gün=7]
 * Gün = analizin üretildiği Türkiye günü (maçtan ~3 sa önce üretildiği için maç gününe ≈ eşit). "Kullanıcı açmış" = en az bir AnalysisUnlock.
 */
import { prisma } from '../src/lib/prisma';

const days = Number(process.argv[2] ?? 7);
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

(async () => {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.matchAnalysis.findMany({
    where: { matchStatus: 'PRE', createdAt: { gte: since } },
    select: { createdAt: true, modelVersion: true, competitionName: true, _count: { select: { unlocks: true } } },
  });
  const byDay = new Map<string, { total: number; v5: number; unlocked: number; leagues: Map<string, number> }>();
  for (const r of rows) {
    const d = fmt.format(r.createdAt);
    const e = byDay.get(d) ?? { total: 0, v5: 0, unlocked: 0, leagues: new Map() };
    e.total += 1;
    if (/^v([5-9]|\d\d)-/.test(r.modelVersion)) e.v5 += 1;
    if (r._count.unlocks > 0) e.unlocked += 1;
    const lg = r.competitionName ?? '?';
    e.leagues.set(lg, (e.leagues.get(lg) ?? 0) + 1);
    byDay.set(d, e);
  }
  for (const [d, e] of [...byDay].sort()) {
    console.log(d, `toplam ${e.total}`, `v5+ ${e.v5}`, `kullanıcı açmış ${e.unlocked}`, [...e.leagues].map(([k, v]) => `${k}:${v}`).join(', '));
  }
  console.log(`son ${days} gün toplam ${rows.length}`);
  await prisma.$disconnect();
})();
