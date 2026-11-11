/**
 * Oran snapshot'larından geriye dönük kâr/zarar özeti (SALT OKUNUR; UI'a bağlı değil). Düz 1 birim bahis varsayımı: isabet →
 * +(oran − 1), ıska → −1. İki görünüm: (1) tekli pazarlar, (2) günlük kombine = o günün olasılığı en yüksek N pazarı (hepsi tutarsa
 * oranların çarpımı). Yalnız sonucu belli (hit ≠ null) ve olasılığı olan satırlar kombineye girer. Örnek küçükse sonuç gürültüdür.
 */
import { prisma } from '@/lib/prisma';
import { parseScore, topPickHit, type TopPickKey } from '@/utils/analysisTopPicks';
import { isMissingTable } from '@/server/combo/oddsSnapshot';
import type { MarketKey } from '@/services/apiFootball/oddsMarkets';
import { COMBO_MARKETS, comboMarketHit, type ComboMarketKey } from '@/utils/comboMarkets';

export type BacktestPick = { matchId: string; day: string; pickKey: MarketKey; pct: number | null; odd: number; hit: boolean | null };

export type BacktestSummary = {
  singles: { picks: number; settled: number; hits: number; hitRate: number | null; avgOdd: number | null; profit: number; roi: number | null; modelExpectedRoi: number | null };
  combos: { days: number; hits: number; hitRate: number | null; avgOdds: number | null; profit: number; roi: number | null; modelExpectedRoi: number | null };
};

const round = (n: number) => Math.round(n * 1000) / 1000;

export function summarizeBacktest(picks: readonly BacktestPick[], opts: { comboSize?: number } = {}): BacktestSummary {
  const size = Math.max(1, Math.floor(opts.comboSize ?? 3));
  const settled = picks.filter((p) => p.hit != null);
  const hits = settled.filter((p) => p.hit).length;
  const profit = settled.reduce((s, p) => s + (p.hit ? p.odd - 1 : -1), 0);
  const withPct = settled.filter((p) => p.pct != null);
  const modelExp = withPct.length ? withPct.reduce((s, p) => s + ((p.pct as number) / 100) * p.odd - 1, 0) / withPct.length : null;

  const byDay = new Map<string, BacktestPick[]>();
  for (const p of settled) {
    if (p.pct == null) continue;
    byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
  }
  let comboDays = 0;
  let comboHits = 0;
  let comboProfit = 0;
  let oddsSum = 0;
  let expSum = 0;
  for (const list of byDay.values()) {
    // Maç başına tek bacak (snapshot maç başına birden çok pazar tutar; aynı maçın pazarları birbirine bağlı).
    const seen = new Set<string>();
    const top = [...list]
      .sort((a, b) => (b.pct as number) - (a.pct as number) || a.matchId.localeCompare(b.matchId))
      .filter((p) => (seen.has(p.matchId) ? false : (seen.add(p.matchId), true)))
      .slice(0, size);
    if (top.length < size) continue; // eksik gün: istenen büyüklükte kombine kurulamaz
    const odds = top.reduce((o, p) => o * p.odd, 1);
    const prob = top.reduce((o, p) => o * ((p.pct as number) / 100), 1);
    const won = top.every((p) => p.hit);
    comboDays += 1;
    oddsSum += odds;
    expSum += prob * odds - 1;
    if (won) {
      comboHits += 1;
      comboProfit += odds - 1;
    } else comboProfit -= 1;
  }
  return {
    singles: {
      picks: picks.length,
      settled: settled.length,
      hits,
      hitRate: settled.length ? round(hits / settled.length) : null,
      avgOdd: settled.length ? round(settled.reduce((s, p) => s + p.odd, 0) / settled.length) : null,
      profit: round(profit),
      roi: settled.length ? round(profit / settled.length) : null,
      modelExpectedRoi: modelExp == null ? null : round(modelExp),
    },
    combos: {
      days: comboDays,
      hits: comboHits,
      hitRate: comboDays ? round(comboHits / comboDays) : null,
      avgOdds: comboDays ? round(oddsSum / comboDays) : null,
      profit: round(comboProfit),
      roi: comboDays ? round(comboProfit / comboDays) : null,
      modelExpectedRoi: comboDays ? round(expSum / comboDays) : null,
    },
  };
}

type SnapshotDbRow = { matchId: string; day: string; pickKey: string; pct: number | null; firstOdd: number; lastOdd: number };

export type BacktestDeps = {
  query?: <T>(text: string, values: unknown[]) => Promise<T[]>;
  records?: (matchIds: string[]) => Promise<Array<{ matchId: string; actualScore: string | null; extendedHits: unknown; evaluatedAt: Date | null }>>;
};

const defaultQuery = <T,>(text: string, values: unknown[]) => prisma.$queryRawUnsafe<T[]>(text, ...values);
const defaultRecords: NonNullable<BacktestDeps['records']> = (matchIds) =>
  prisma.predictionRecord.findMany({
    where: { matchId: { in: matchIds }, evaluatedAt: { not: null } },
    select: { matchId: true, actualScore: true, extendedHits: true, evaluatedAt: true },
  });

/** Snapshot satırları + maç sonuçları → `BacktestPick[]`; tablo yoksa null. `which`: açılışa yakın (first) ya da kapanışa yakın (last) oran. */
export async function loadBacktestPicks(which: 'first' | 'last' = 'last', deps: BacktestDeps = {}): Promise<BacktestPick[] | null> {
  let rows: SnapshotDbRow[];
  try {
    rows = await (deps.query ?? defaultQuery)<SnapshotDbRow>(`SELECT "matchId","day","pickKey","pct","firstOdd","lastOdd" FROM "ComboOddsSnapshot" WHERE "kickoffAt" < CURRENT_TIMESTAMP`, []);
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (rows.length === 0) return [];
  const recs = await (deps.records ?? defaultRecords)([...new Set(rows.map((r) => r.matchId))]);
  const byMatch = new Map(recs.map((r) => [r.matchId, r]));
  return rows.map((r) => {
    const rec = byMatch.get(r.matchId);
    const pick = { key: r.pickKey as TopPickKey, pct: r.pct ?? 50 };
    // Olasılıksız (milli) satırda yalnız skordan çıkarılabilen pazarlar (home/draw/away/over25/btts) değerlendirilir.
    const combo = (COMBO_MARKETS as readonly string[]).includes(r.pickKey);
    const hit = !rec
      ? null
      : combo
        ? comboMarketHit(r.pickKey as ComboMarketKey, parseScore(rec.actualScore))
        : topPickHit(pick, parseScore(rec.actualScore), (rec.extendedHits ?? null) as Record<string, boolean | null> | null);
    return { matchId: r.matchId, day: r.day, pickKey: r.pickKey as MarketKey, pct: r.pct, odd: which === 'first' ? r.firstOdd : r.lastOdd, hit };
  });
}
