/**
 * Kombine aracının pazar kümesi: yalnız toplam gol (1,5 / 2,5 / 3,5 — iki yön) ve iki takım da gol bulur (var / yok).
 * Neden bu sekiz: AI analizinin özü gol beklentisidir, sekizi de aynı gol dağılımından çıkar; Türkiye'deki oyun sitelerinde
 * her maçta standart olarak açılan pazarlardır. Analiz kartının diğer pazarları (takım gol bulur, ilk yarı…) kombineye GİRMEZ.
 *
 * Olasılık: model (analiz) ile piyasanın marjı temizlenmiş olasılığının harmanı. Kartta piyasa oranı yerine ADİL oran
 * (1 / olasılık) gösterilir — kullanıcı kendi sitesindeki oranla karşılaştırır.
 */

export type ComboMarketKey = 'over15' | 'under15' | 'over25' | 'under25' | 'over35' | 'under35' | 'btts' | 'bttsNo';

export const COMBO_MARKETS: readonly ComboMarketKey[] = ['over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'btts', 'bttsNo'];

/** Pazarın karşı yönü (marj temizleme iki yönün oranıyla yapılır). */
export const OPPOSITE: Record<ComboMarketKey, ComboMarketKey> = {
  over15: 'under15',
  under15: 'over15',
  over25: 'under25',
  under25: 'over25',
  over35: 'under35',
  under35: 'over35',
  btts: 'bttsNo',
  bttsNo: 'btts',
};

/**
 * Harmanda modelin ağırlığı (0 = yalnız piyasa, 1 = yalnız model). Kalibrasyon (scripts/combo-kalibrasyon.ts, 2026-11-11,
 * 102 değerlendirilmiş v5+ maç): sekiz pazarın hiçbirinde model sabit taban oranı tahmininden iyi değil (Brier becerisi
 * −6 … +0,6 %). Bu yüzden piyasa ağır basar (0,25); oran biriktirildikçe (oddsSnapshot) pazar başına yeniden ayarlanır.
 */
export const MODEL_WEIGHT: Record<ComboMarketKey, number> = {
  over15: 0.25,
  under15: 0.25,
  over25: 0.25,
  under25: 0.25,
  over35: 0.25,
  under35: 0.25,
  btts: 0.25,
  bttsNo: 0.25,
};

type GoalSource = { goalExpectation?: Partial<Record<'over15' | 'over25' | 'over35' | 'btts', unknown>> | null };

const asPct = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/** Modelin sekiz pazardaki olasılığı (yüzde, tamsayı). Alt = 100 − üst, KG yok = 100 − KG var. Eksik çizgi atlanır. */
export function comboMarketPcts(analysis: GoalSource): Array<{ key: ComboMarketKey; pct: number }> {
  const ge = analysis.goalExpectation ?? {};
  const out: Array<{ key: ComboMarketKey; pct: number }> = [];
  const pair = (yes: ComboMarketKey, no: ComboMarketKey, raw: unknown) => {
    const p = asPct(raw);
    if (p == null) return;
    out.push({ key: yes, pct: Math.round(p) }, { key: no, pct: Math.round(100 - p) });
  };
  pair('over15', 'under15', ge.over15);
  pair('over25', 'under25', ge.over25);
  pair('over35', 'under35', ge.over35);
  pair('btts', 'bttsNo', ge.btts);
  return out;
}

/** Pazar tuttu mu (tam skordan). Skor yoksa null. */
export function comboMarketHit(key: ComboMarketKey, score: { home: number; away: number } | null): boolean | null {
  if (!score) return null;
  const goals = score.home + score.away;
  const both = score.home > 0 && score.away > 0;
  switch (key) {
    case 'over15':
      return goals >= 2;
    case 'under15':
      return goals <= 1;
    case 'over25':
      return goals >= 3;
    case 'under25':
      return goals <= 2;
    case 'over35':
      return goals >= 4;
    case 'under35':
      return goals <= 3;
    case 'btts':
      return both;
    case 'bttsNo':
      return !both;
  }
}

/** Model ve piyasa olasılığının harmanı (yüzde, bir ondalık). Piyasa yoksa model. */
export function blendPct(modelPct: number, marketPct: number | null, weight: number): number {
  if (marketPct == null) return modelPct;
  const w = Math.min(Math.max(weight, 0), 1);
  return Math.round((w * modelPct + (1 - w) * marketPct) * 10) / 10;
}

/** Adil oran = 1 / olasılık (iki ondalık). */
export function fairOdds(pct: number): number {
  return pct > 0 ? Math.round((100 / pct) * 100) / 100 : Infinity;
}

/**
 * İki yönlü pazarda marjı temizlenmiş olasılık (yüzde): (1/o) / (1/o + 1/o_karşı). Oranlar geçersizse null.
 */
export function devigPair(odd: number, oppositeOdd: number): number | null {
  if (!(odd > 1) || !(oppositeOdd > 1)) return null;
  const a = 1 / odd;
  const b = 1 / oppositeOdd;
  return (a / (a + b)) * 100;
}

/** Kartta en çok bu kadar olasılıklı pazar önerilir — üstü 1,25'in altında adil oran demektir (pratikte oynanmaz). */
export const PCT_CAP = 80;
