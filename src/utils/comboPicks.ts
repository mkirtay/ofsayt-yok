/**
 * Kombine aracının saf çekirdeği (yalnız ADMIN aracı): her maçtan YALNIZ en güçlü tek pazar, kombine tutma olasılığı =
 * olasılıkların çarpımı (farklı maçlar bağımsız varsayılır), risk ayarlı öneri. Pazar seçimi analiz kartıyla aynı
 * kaynaktan (`pickTopPredictions`). Aynı maçın pazarları birbirine bağlı olduğu için bir maçtan ikinci seçim yapılmaz.
 */
import { pickTopPredictions, type TopPickKey } from '@/utils/analysisTopPicks';
import { comboMarketPcts, PCT_CAP, type ComboMarketKey } from '@/utils/comboMarkets';

export type ComboCandidate = {
  matchId: string;
  label: string;
  competition?: string | null;
  kickoffIso?: string | null;
  /** Kombine pazarı (yalnız toplam gol / iki takım da gol bulur — comboMarkets.ts). */
  key: ComboMarketKey;
  /** Modelin olasılığı, yüzde (1–100). */
  pct: number;
  /** Yaklaşık piyasa oranı (uluslararası bookmaker); yoksa / eşleşmediyse null. */
  odd?: number | null;
};

type ProbSource = Parameters<typeof pickTopPredictions>[0];

/** Maçın en güçlü tek pazarı; olasılık verisi yoksa null. */
export function bestPickOfMatch(analysis: ProbSource): { key: TopPickKey; pct: number } | null {
  return pickTopPredictions(analysis, 1)[0] ?? null;
}

/**
 * Kombine pazarları arasında modelin en olası (ama %PCT_CAP'i aşmayan) seçimi — "Kendin ayarla" akışının maç başına pazarı.
 * %80 üstü adil oranı 1,25'in altına düşürür (pratikte oynanmaz). Uygun pazar yoksa null.
 */
export function bestComboPickOfMatch(analysis: ProbSource): { key: ComboMarketKey; pct: number } | null {
  const ok = comboMarketPcts(analysis as never).filter((m) => m.pct <= PCT_CAP && m.pct >= 50);
  return ok.sort((a, b) => b.pct - a.pct)[0] ?? null;
}

/** Kombine tutma olasılığı (0–1) = olasılıkların çarpımı. Boş liste → 0. */
export function comboProbability(pcts: readonly number[]): number {
  if (pcts.length === 0) return 0;
  return pcts.reduce((acc, p) => acc * (p / 100), 1);
}

/** Kombine oran = oranların çarpımı; herhangi biri yoksa / geçersizse (≤ 1) null. */
export function comboOdds(odds: ReadonlyArray<number | null | undefined>): number | null {
  if (odds.length === 0) return null;
  let total = 1;
  for (const o of odds) {
    if (typeof o !== 'number' || !Number.isFinite(o) || o <= 1) return null;
    total *= o;
  }
  return total;
}

/** Bu oranın başabaş olması için gereken tutma olasılığı (0–1). */
export function breakEvenProbability(odds: number): number {
  return odds > 0 ? 1 / odds : 1;
}

/** Beklenen getiri farkı: olasılık × oran − 1 (0 = başabaş; negatif = oran olasılığın altında). */
export function valueEdge(probability: number, odds: number): number {
  return probability * odds - 1;
}

export type RiskLevel = 'safe' | 'balanced' | 'bold';
export type RiskPreset = { minPct: number; maxMatches: number };

export const RISK_PRESETS: Record<RiskLevel, RiskPreset> = {
  safe: { minPct: 80, maxMatches: 3 },
  balanced: { minPct: 70, maxMatches: 4 },
  bold: { minPct: 60, maxMatches: 6 },
};

export type SuggestOptions = { minPct: number; maxMatches: number; targetOdds?: number | null };

export type SuggestResult = {
  picks: ComboCandidate[];
  /** `target-unreachable`: hedef oran eşik + maç sayısı sınırıyla ulaşılamıyor; `no-candidates`: eşiği geçen yok. */
  reason?: 'no-candidates' | 'target-unreachable';
  /** `target-unreachable` iken ulaşılabilen en yüksek oran. */
  maxReachableOdds?: number;
};

/** En çok 16 aday üzerinde tüm alt kümeler (2^16 = 65 536) taranır; fazlası en yüksek olasılıklı 16 ile sınırlanır. */
const SEARCH_POOL = 16;

function byPctDesc(a: ComboCandidate, b: ComboCandidate): number {
  return b.pct - a.pct || a.matchId.localeCompare(b.matchId);
}

/**
 * Öneri. Hedef oran yoksa: eşiği geçenlerin en güçlü `maxMatches` tanesi. Hedef oran varsa (yalnız oranı olan adaylar):
 * kombine oranı hedefe ulaşan, en çok `maxMatches` maçlık alt kümeler arasında kombine olasılığı EN YÜKSEK olan
 * (eşitlikte daha az maç). Oran arttıkça olasılığın çarpımla düştüğü sonuçta görünür.
 */
export function suggestCombo(candidates: readonly ComboCandidate[], opts: SuggestOptions): SuggestResult {
  const maxMatches = Math.max(1, Math.floor(opts.maxMatches));
  const eligible = candidates.filter((c) => c.pct >= opts.minPct).sort(byPctDesc);
  if (eligible.length === 0) return { picks: [], reason: 'no-candidates' };
  const target = opts.targetOdds;
  if (target == null || !Number.isFinite(target) || target <= 1) return { picks: eligible.slice(0, maxMatches) };

  const pool = eligible.filter((c) => typeof c.odd === 'number' && c.odd > 1).slice(0, SEARCH_POOL);
  if (pool.length === 0) return { picks: [], reason: 'no-candidates' };

  let best: { mask: number; prob: number; size: number } | null = null;
  let maxOdds = 0;
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    let size = 0;
    let odds = 1;
    let prob = 1;
    for (let i = 0; i < pool.length; i++) {
      if (!(mask & (1 << i))) continue;
      size += 1;
      if (size > maxMatches) break;
      odds *= pool[i].odd as number;
      prob *= pool[i].pct / 100;
    }
    if (size > maxMatches) continue;
    if (odds > maxOdds) maxOdds = odds;
    if (odds < target) continue;
    if (!best || prob > best.prob + 1e-12 || (Math.abs(prob - best.prob) <= 1e-12 && size < best.size)) best = { mask, prob, size };
  }
  if (!best) return { picks: [], reason: 'target-unreachable', maxReachableOdds: maxOdds };
  const mask = best.mask;
  return { picks: pool.filter((_, i) => mask & (1 << i)) };
}

export type CalibrationBand = { label: string; min: number; max: number; matches: number; hits: number; rate: number | null };

const BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '%50–59', min: 50, max: 59 },
  { label: '%60–69', min: 60, max: 69 },
  { label: '%70–79', min: 70, max: 79 },
  { label: '%80–89', min: 80, max: 89 },
  { label: '%90+', min: 90, max: 100 },
];

/** Minimum örnek: bunun altındaki bantta oran "az örnek" uyarısıyla gösterilir. */
export const MIN_RELIABLE_SAMPLE = 30;

/** Değerlendirilmiş maçların en güçlü tek pazarının isabeti, olasılık bantlarına göre. `hit` null olanlar sayılmaz. */
export function calibrationBands(rows: ReadonlyArray<{ pct: number; hit: boolean | null }>): CalibrationBand[] {
  return BANDS.map((b) => {
    const inBand = rows.filter((r) => r.hit != null && r.pct >= b.min && r.pct <= b.max);
    const hits = inBand.filter((r) => r.hit).length;
    return { ...b, matches: inBand.length, hits, rate: inBand.length ? Math.round((hits / inBand.length) * 1000) / 10 : null };
  });
}
