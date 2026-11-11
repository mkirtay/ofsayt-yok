/**
 * Kombine planlama çekirdeği (saf; sunucu/istemci ortak): risk yüzdesi → eşik / varsayılan hedef oran, tutar doğrulama,
 * düz kombine ve SİSTEM (n maçtan k doğru) getiri dağılımı. Maçlar BAĞIMSIZ varsayılır; olasılıklar modelin tahminidir —
 * hiçbir çıktı garanti değildir. Sistemde n ≤ 8 için 2^n sonucun tamamı kesin hesaplanır.
 */
import { comboOdds, comboProbability, suggestCombo, type ComboCandidate, type SuggestResult } from '@/utils/comboPicks';

export const MAX_SYSTEM_LEGS = 8;
export const MAX_STAKE = 1_000_000;

/** Kullanıcı girdisi → tutar (TL, 2 ondalık) ya da geçersizse null: > 0 ve ≤ MAX_STAKE; "2.000,50" / "2000.5" / "2000" kabul. */
export function parseStake(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/\s|₺|TL/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= MAX_STAKE ? n : null;
}

export const MAX_MISLI = 1000;
/** Tutar × misli üst sınırı (TL): saçma değerlerde taşma / okunmaz sayı olmasın. */
export const MAX_UNIT_TOTAL = 10_000_000;

/** Misli (çarpan): tamsayı, 1 ≤ m ≤ MAX_MISLI; boş → 1; ondalık / negatif / metin → null. */
export function parseMisli(input: string | number | null | undefined): number | null {
  if (input == null || String(input).trim() === '') return 1;
  const s = String(input).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_MISLI ? n : null;
}

/** Birim tutar = tutar × misli (TL, 2 ondalık); her kombinasyon / kupon bu tutarla oynanır. Aşırı büyükse null. */
export function effectiveUnit(stake: number | null, misli: number | null): number | null {
  if (stake == null || misli == null) return null;
  const u = Math.round(stake * misli * 100) / 100;
  return u > 0 && u <= MAX_UNIT_TOTAL ? u : null;
}

/** Hedef oran girdisi ("20", "1,7") → 1 < oran ≤ 1000, aksi null. */
export function parseTargetOdds(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  const n = Number(String(input).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 1 && n <= 1000 ? n : null;
}

const clampRisk = (r: number) => Math.min(100, Math.max(0, Number.isFinite(r) ? r : 0));

/** Risk % (0 = çok temkinli, 100 = çok iddialı) → pazar başına en düşük model olasılığı: %85 … %55. */
export function riskToMinPct(risk: number): number {
  return Math.round(85 - (clampRisk(risk) / 100) * 30);
}

/** Risk % → en çok maç sayısı: 2 … 8. */
export function riskToMaxMatches(risk: number): number {
  return Math.round(2 + (clampRisk(risk) / 100) * 6);
}

/** Hedef oran girilmediyse risk % → varsayılan hedef oran: ≈1,7 … ≈10 (üstel). */
export function riskToTargetOdds(risk: number): number {
  return Math.round(1.7 * Math.pow(6, clampRisk(risk) / 100) * 10) / 10;
}

export type Leg = { p: number; odd: number };

export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export type SystemResult = {
  n: number;
  k: number;
  combinations: number;
  /** Toplam yatırım = kombinasyon sayısı × birim tutar. */
  totalStake: number;
  expectedReturn: number;
  expectedProfit: number;
  /** Toplam getiri > toplam yatırım olasılığı. */
  profitProbability: number;
  /** En az bir k'lı kombinasyon tutar (≥ k maç tutar) olasılığı. */
  anyHitProbability: number;
  /** Tüm maçlar tutarsa getiri (üst sınır). */
  maxReturn: number;
};

/**
 * Sistem (n maçtan k doğru): kombinasyon sayısı = C(n,k); her kombinasyon birim tutarla oynanır. 2^n sonucun tamamı taranır:
 * tutan maçlar kümesi H için getiri = birim × Σ_{S ⊆ H, |S|=k} Π oran(S). k = n düz kombinedir (tek kombinasyon).
 */
export function systemOutcome(legs: readonly Leg[], k: number, unit: number): SystemResult | null {
  const n = legs.length;
  if (n < 1 || n > MAX_SYSTEM_LEGS || !Number.isInteger(k) || k < 1 || k > n || !(unit > 0)) return null;
  if (legs.some((l) => !(l.p >= 0 && l.p <= 1) || !(l.odd > 1))) return null;
  const combinations = comb(n, k);
  const totalStake = combinations * unit;
  let expectedReturn = 0;
  let profitProbability = 0;
  let anyHit = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let prob = 1;
    const hit: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        prob *= legs[i].p;
        hit.push(legs[i].odd);
      } else prob *= 1 - legs[i].p;
    }
    if (prob === 0 || hit.length < k) continue;
    // Tutan maçların k'lı alt kümelerinin oran çarpımları toplamı (e_k temel simetrik polinom, DP).
    const e = new Array<number>(k + 1).fill(0);
    e[0] = 1;
    for (const o of hit) for (let j = k; j >= 1; j--) e[j] += e[j - 1] * o;
    const payout = unit * e[k];
    anyHit += prob;
    expectedReturn += prob * payout;
    if (payout > totalStake + 1e-9) profitProbability += prob;
  }
  const maxReturn = unit * (() => {
    const e = new Array<number>(k + 1).fill(0);
    e[0] = 1;
    for (const l of legs) for (let j = k; j >= 1; j--) e[j] += e[j - 1] * l.odd;
    return e[k];
  })();
  return { n, k, combinations, totalStake, expectedReturn, expectedProfit: expectedReturn - totalStake, profitProbability, anyHitProbability: anyHit, maxReturn };
}

export type StraightResult = {
  stake: number;
  odds: number;
  probability: number;
  potentialReturn: number;
  breakEven: number;
  /** Beklenen getiri − yatırım. */
  expectedProfit: number;
};

/** Düz kombine özeti: tutar × oran = olası getiri; beklenen değer = olasılık × getiri − tutar. */
export function straightOutcome(legs: readonly ComboCandidate[], stake: number): StraightResult | null {
  const odds = comboOdds(legs.map((l) => l.odd));
  if (odds == null || !(stake > 0) || legs.length === 0) return null;
  const probability = comboProbability(legs.map((l) => l.pct));
  return { stake, odds, probability, potentialReturn: stake * odds, breakEven: 1 / odds, expectedProfit: probability * stake * odds - stake };
}

export type TypeAdvice = { type: 'straight' | 'system'; k?: number; reason: 'fewLegs' | 'lowRisk' | 'highRisk' | 'smallStake' };

/**
 * "Sana düz mü sistem mi": 3'ten az maçta düz; temkinli (risk < 50) → düz; iddialı + ≥ 4 maç → sistem (n−1 doğru; tek ıskaya
 * toleranslı); iddialı ama tutar küçük değilse de sistem. Toplam yatırım kombinasyon sayısıyla çarpılır — küçük tutarda (< 100 TL
 * birim) düz öner (sistemin toplam yatırımı hızla büyür).
 */
export function adviseType(n: number, risk: number, unitStake: number): TypeAdvice {
  if (n < 3) return { type: 'straight', reason: 'fewLegs' };
  if (clampRisk(risk) < 50) return { type: 'straight', reason: 'lowRisk' };
  if (n < 4 || n > MAX_SYSTEM_LEGS) return { type: 'straight', reason: 'fewLegs' };
  if (unitStake < 100 && comb(n, n - 1) * unitStake < 100) return { type: 'straight', reason: 'smallStake' };
  return { type: 'system', k: n - 1, reason: 'highRisk' };
}

export type PlanSuggestion = SuggestResult & {
  /** Seçimde kullanılan en düşük pazar olasılığı (hedefe ulaşmak için riskin eşiğinden gevşetilmiş olabilir). */
  usedMinPct: number;
  /** Eşik, riskin istediğinden aşağı çekildi mi. */
  relaxed: boolean;
};

export const MIN_PCT_FLOOR = 55;

/**
 * Risk % + hedef oran → öneri. Önce riskin eşiğiyle (`riskToMinPct`) denenir; hedef oran bu eşikle ulaşılamıyorsa eşik 5'er puan
 * gevşetilir (en çok `MIN_PCT_FLOOR`'a kadar) — "1,7 istiyorum" çok temkinli bir eşikle imkânsızdır, en olası ulaşan küme aranır.
 * Hedef yoksa yalnız eşik + maç sayısı (eşiği geçen yoksa yine `floor`'a kadar gevşetilir; altına inilmez).
 */
export function suggestForRisk(pool: readonly ComboCandidate[], opts: { risk: number; maxMatches?: number; targetOdds?: number | null; floor?: number }): PlanSuggestion {
  const floor = opts.floor ?? MIN_PCT_FLOOR;
  const maxMatches = opts.maxMatches ?? riskToMaxMatches(opts.risk);
  const start = Math.max(riskToMinPct(opts.risk), floor);
  let last: SuggestResult = { picks: [], reason: 'no-candidates' };
  const steps: number[] = [];
  for (let m = start; m > floor; m -= 5) steps.push(m);
  steps.push(floor); // taban her zaman denenir (5'in katı olmasa da), altına inilmez
  for (const minPct of steps) {
    last = suggestCombo(pool, { minPct, maxMatches, targetOdds: opts.targetOdds ?? null });
    if (last.picks.length > 0) return { ...last, usedMinPct: minPct, relaxed: minPct < start };
  }
  return { ...last, usedMinPct: floor, relaxed: true };
}
