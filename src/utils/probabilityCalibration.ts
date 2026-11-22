/**
 * AI olasılık kalibrasyonu + "temel orandan sapan" öne çıkan tahmin seçimi (büyüme raporu 1.4 / 1.5).
 *
 * Bulgu (2026-11-22, 280 maç): kartta gösterilen ortalama %68,8, gerçekleşme %80 — model çekingen. Çözüm: geçmiş
 * değerlendirilmiş tahminlerden pazar başına isotonic (PAV) eğri; YENİ analiz kaydedilirken olasılıklar eğriden geçer.
 * Ham değerler `fullReport.rawProbabilities`'te saklanır (yeniden eğitim için; eğri ham → gerçekleşme üzerine kurulur).
 *
 * Öne çıkan 3 tahmin: eskiden "en yüksek olasılıklı 3" (hep 2+ gol, ev sahibi gol bulur — temel oranı zaten yüksek,
 * bilgi değeri yok). Yeni kural: olasılığı ≥ %50 olan iddialar içinden (olasılık − temel oran) en büyük 3; yetmezse en
 * olası olanlarla tamamlanır. Seçim kayda yazılır (`fullReport.topPickKeys`) → eski analizler eski kuralla kalır.
 *
 * Tablo: config/aiCalibrationMap.json (`npx tsx --env-file=.env.local scripts/ai-kalibrasyon-tablo.ts`).
 */
import type { TopPickKey } from './analysisTopPicks';

export type CurvePoint = [raw: number, calibrated: number];
export type CalibrationMap = {
  version: string;
  generatedAt: string;
  /** Eğrinin kurulduğu değerlendirilmiş maç sayısı. */
  matches: number;
  /** Pazar başına temel oran (%). */
  baseRates: Partial<Record<TopPickKey, number>>;
  /** Pazar başına eğri; yeterli örnek yoksa pazar yok → `global` kullanılır. */
  curves: Partial<Record<TopPickKey, CurvePoint[]>>;
  global: CurvePoint[];
};

export const RESULT_KEYS = ['home', 'draw', 'away'] as const;
export const GOAL_KEYS = ['over15', 'over25', 'over35', 'btts', 'htOver05', 'htOver15', 'homeToScore', 'awayToScore', 'bttsFirstHalf'] as const;
const MIN_PCT = 5;
const MAX_PCT = 95;
/** Bir olasılığı en fazla bu kadar puan oynat (az örnekli uçlarda %61 → %100 gibi aşırı uyumu keser). */
export const MAX_SHIFT = 15;
/** Her bloğu ham değere doğru büzen sözde gözlem sayısı (Bayes ön bilgisi; az örnekli blok ham değerden az uzaklaşır). */
export const PRIOR_STRENGTH = 30;

/**
 * Isotonic regresyon (pool adjacent violators): (x, y∈{0,1}) → x'e göre azalmayan adım fonksiyonu; her blok
 * (ortalama x, ortalama y) noktası olarak döner. Sonra doğrusal ara değerleme.
 */
export function fitIsotonic(points: ReadonlyArray<{ x: number; y: number }>, prior = PRIOR_STRENGTH): CurvePoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const blocks: { sx: number; sy: number; w: number }[] = [];
  for (const p of sorted) {
    blocks.push({ sx: p.x, sy: p.y, w: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.sy / a.w <= b.sy / b.w) break;
      blocks.splice(blocks.length - 2, 2, { sx: a.sx + b.sx, sy: a.sy + b.sy, w: a.w + b.w });
    }
  }
  // Büzme: (Σy + k·x̄) / (w + k) — sonra azalmayan kalsın diye birikimli en büyük.
  let prev = -Infinity;
  return blocks.map((b) => {
    const mx = b.sx / b.w;
    const shrunk = ((b.sy + prior * (mx / 100)) / (b.w + prior)) * 100;
    prev = Math.max(prev, shrunk);
    return [Math.round(mx * 10) / 10, Math.round(prev * 10) / 10] as CurvePoint;
  });
}

/** Eğri üzerinde doğrusal ara değer (uçlarda sabit); ham değerden en fazla ±MAX_SHIFT, [%5, %95] aralığında, tam sayı. */
export function applyCurve(curve: ReadonlyArray<CurvePoint>, raw: number): number {
  if (!Number.isFinite(raw)) return raw;
  if (curve.length === 0) return raw;
  let v: number;
  if (raw <= curve[0]![0]) v = curve[0]![1];
  else if (raw >= curve[curve.length - 1]![0]) v = curve[curve.length - 1]![1];
  else {
    let i = 1;
    while (curve[i]![0] < raw) i += 1;
    const [x0, y0] = curve[i - 1]!;
    const [x1, y1] = curve[i]!;
    v = x1 === x0 ? y1 : y0 + ((raw - x0) / (x1 - x0)) * (y1 - y0);
  }
  v = Math.min(raw + MAX_SHIFT, Math.max(raw - MAX_SHIFT, v));
  return Math.round(Math.min(MAX_PCT, Math.max(MIN_PCT, v)));
}

export function calibratePct(map: CalibrationMap, key: TopPickKey, raw: number): number {
  return applyCurve(map.curves[key] ?? map.global, raw);
}

type Probs = { matchPrediction: Record<string, unknown>; goalExpectation: Record<string, unknown> };

/**
 * Analiz olasılıklarını kalibre eder: gol pazarları tek tek; maç sonucu üçlüsü kalibre edilip toplamı 100'e
 * normalize edilir. Sayı olmayan alanlar (reasoning) aynen kalır.
 */
export function calibrateProbabilities<T extends Probs>(p: T, map: CalibrationMap): T {
  const ge: Record<string, unknown> = { ...p.goalExpectation };
  for (const k of GOAL_KEYS) {
    const v = Number(ge[k]);
    if (Number.isFinite(v)) ge[k] = calibratePct(map, k, v);
  }
  const mp: Record<string, unknown> = { ...p.matchPrediction };
  const raw = RESULT_KEYS.map((k) => Number(mp[k]));
  if (raw.every(Number.isFinite)) {
    const cal = RESULT_KEYS.map((k, i) => calibratePct(map, k, raw[i]!));
    const sum = cal.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const scaled = cal.map((c) => Math.round((c / sum) * 100));
      // Yuvarlama artığını en büyük olana ekle (toplam tam 100)
      const maxI = scaled.indexOf(Math.max(...scaled));
      scaled[maxI]! += 100 - scaled.reduce((a, b) => a + b, 0);
      RESULT_KEYS.forEach((k, i) => (mp[k] = scaled[i]));
    }
  }
  return { ...p, matchPrediction: mp, goalExpectation: ge };
}

/**
 * Öne çıkan 3 tahmin (yeni kural): olasılığı ≥ %50 olan iddialardan (olasılık − temel oran) en büyük `n`;
 * eksik kalırsa en yüksek olasılıklılarla tamamlanır. Temel oranı bilinmeyen pazar sapma sıralamasına girmez.
 */
export function pickByLift(probs: Probs, baseRates: CalibrationMap['baseRates'], n = 3): TopPickKey[] {
  const all = ([...RESULT_KEYS, ...GOAL_KEYS] as TopPickKey[])
    .map((key) => ({ key, pct: Number((RESULT_KEYS as readonly string[]).includes(key) ? probs.matchPrediction[key] : probs.goalExpectation[key]) }))
    .filter((c) => Number.isFinite(c.pct) && c.pct > 0 && c.pct <= 100);
  const lifted = all
    .filter((c) => c.pct >= 50 && baseRates[c.key] != null)
    .map((c) => ({ ...c, lift: c.pct - baseRates[c.key]! }))
    .sort((a, b) => b.lift - a.lift || b.pct - a.pct);
  const out: TopPickKey[] = lifted.slice(0, n).map((c) => c.key);
  for (const c of [...all].sort((a, b) => b.pct - a.pct)) {
    if (out.length >= n) break;
    if (!out.includes(c.key)) out.push(c.key);
  }
  return out;
}

/** Senaryo metninden pazar (kartın gol beklentisiyle aynı eğri → aynı olay aynı yüzde). Tanınmazsa null (global eğri). */
export function scenarioMarket(metric: string): TopPickKey | null {
  const m = metric.toLocaleLowerCase('tr-TR');
  if (/ilk yar[ıi].*(iki takım|her iki)/.test(m)) return 'bttsFirstHalf';
  if (/ilk yar[ıi].*2\+/.test(m)) return 'htOver15';
  if (/ilk yar[ıi].*gol/.test(m)) return 'htOver05';
  if (/(iki takım da|her iki takım).*gol/.test(m)) return 'btts';
  if (/^\s*4\+\s*gol/.test(m)) return 'over35';
  if (/^\s*3\+\s*gol/.test(m)) return 'over25';
  if (/^\s*2\+\s*gol/.test(m)) return 'over15';
  if (/ev sahibi.*gol/.test(m)) return 'homeToScore';
  if (/deplasman.*gol/.test(m)) return 'awayToScore';
  if (/ev sahibi.*kazan/.test(m)) return 'home';
  if (/deplasman.*kazan/.test(m)) return 'away';
  if (/beraber/.test(m)) return 'draw';
  return null;
}

export function calibrateScenarios<T extends { metric: string; probability: number }>(scenarios: readonly T[], map: CalibrationMap): T[] {
  return scenarios.map((s) => {
    const key = scenarioMarket(s.metric);
    const p = Number(s.probability);
    if (!Number.isFinite(p)) return s;
    return { ...s, probability: key ? calibratePct(map, key, p) : applyCurve(map.global, p) };
  });
}
