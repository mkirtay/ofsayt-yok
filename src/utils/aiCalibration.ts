/**
 * AI isabet sayfası — "temel orana karşı" ve kalibrasyon (büyüme raporu 1.2).
 *
 * Sorun: "en güçlü 3 tahmin" çoğunlukla zaten sık olan olaylardan ("2+ gol", "ev sahibi gol bulur") seçiliyor; çıplak
 * isabet oranı modelin becerisini değil o olayların doğal sıklığını ölçüyor. Bu modül iki dürüstlük ölçüsü üretir:
 *
 *  1. Temel oran: bir pazarın (ör. 2+ gol) değerlendirilen TÜM maçlarda gerçekleşme sıklığı — model seçmese de.
 *     Kartın seçtiği tahminlerin "hep aynı pazarı söyleseydin" beklenen isabeti = seçilen pazarların temel oranlarının
 *     ortalaması. Model isabeti bundan yüksekse seçim bilgi katıyor demektir.
 *  2. Kalibrasyon: kartta gösterilen yüzde ile gerçekleşme oranı örtüşüyor mu (bantlar) + Brier skoru
 *     (ortalama (p − sonuç)²; düşük iyi) ve temel orana göre beceri skoru (1 − Brier / Brier_temel; > 0 iyi).
 *
 * Saf hesap: veri katmanı (lib/loadAiStatsDashboard.ts) her değerlendirilmiş maç için rozetleri ve pazar sonuçlarını verir.
 */
import type { TopPickKey } from './analysisTopPicks';

export type CalibrationPick = { key: TopPickKey; pct: number; hit: boolean | null };
/** Bir değerlendirilmiş maç: kart rozetleri + bilinen pazar sonuçları (olay gerçekleşti mi). */
export type CalibrationMatch = { picks: CalibrationPick[]; outcomes: Partial<Record<TopPickKey, boolean>> };

export type CalibrationBand = { label: string; min: number; max: number; picks: number; avgShown: number | null; rate: number | null };
export type MarketBaseline = { key: TopPickKey; picks: number; hitRate: number | null; baseRate: number | null; baseSample: number };

export type AiCalibration = {
  /** Sonucu bilinen rozet sayısı. */
  picks: number;
  /** Kartta gösterilen ortalama olasılık (%). */
  avgShown: number;
  /** Gerçekleşme oranı (%). */
  actualRate: number;
  /** Aynı pazarlar hep söylenseydi beklenen isabet (%): seçilen pazarların temel oran ortalaması. */
  baseRate: number;
  /** Ortalama (p − sonuç)², 0–1; düşük iyi. */
  brier: number;
  /** Temel oranı olasılık olarak kullanan "saf" tahminin Brier'i. */
  brierBase: number;
  /** 1 − brier / brierBase; > 0 ise model temel orandan iyi. */
  skill: number;
  bands: CalibrationBand[];
  markets: MarketBaseline[];
};

const BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '%50 altı', min: 0, max: 49 },
  { label: '%50–59', min: 50, max: 59 },
  { label: '%60–69', min: 60, max: 69 },
  { label: '%70–79', min: 70, max: 79 },
  { label: '%80–89', min: 80, max: 89 },
  { label: '%90+', min: 90, max: 100 },
];

/** Bantta bundan az rozet varsa oran "az örnek" sayılır (grafikte soluk, metinde uyarı). */
export const MIN_BAND_SAMPLE = 20;

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Pazar başına temel oran (%): sonucu bilinen tüm maçlarda olayın gerçekleşme sıklığı. */
export function marketBaseRates(matches: ReadonlyArray<CalibrationMatch>): Map<TopPickKey, { rate: number; sample: number }> {
  const acc = new Map<TopPickKey, { yes: number; n: number }>();
  for (const m of matches) {
    for (const [key, happened] of Object.entries(m.outcomes) as [TopPickKey, boolean | undefined][]) {
      if (typeof happened !== 'boolean') continue;
      const a = acc.get(key) ?? { yes: 0, n: 0 };
      a.n += 1;
      if (happened) a.yes += 1;
      acc.set(key, a);
    }
  }
  return new Map([...acc].map(([k, a]) => [k, { rate: (a.yes / a.n) * 100, sample: a.n }]));
}

/** Seçilen rozetlerin temel orana göre beklenen isabeti (%), yalnız sonucu ve temel oranı bilinen rozetler. */
export function expectedBaseRate(picks: ReadonlyArray<CalibrationPick>, base: Map<TopPickKey, { rate: number }>): number | null {
  const rates = picks.filter((p) => p.hit != null && base.has(p.key)).map((p) => base.get(p.key)!.rate);
  return rates.length ? r1(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
}

export function computeCalibration(matches: ReadonlyArray<CalibrationMatch>): AiCalibration | null {
  const base = marketBaseRates(matches);
  const known = matches.flatMap((m) => m.picks).filter((p): p is CalibrationPick & { hit: boolean } => p.hit != null && base.has(p.key));
  if (known.length === 0) return null;

  let shown = 0;
  let hits = 0;
  let baseSum = 0;
  let brier = 0;
  let brierBase = 0;
  for (const p of known) {
    const y = p.hit ? 1 : 0;
    const b = base.get(p.key)!.rate / 100;
    shown += p.pct;
    hits += y;
    baseSum += b;
    brier += (p.pct / 100 - y) ** 2;
    brierBase += (b - y) ** 2;
  }
  const n = known.length;

  const bands = BANDS.map((band) => {
    const inBand = known.filter((p) => p.pct >= band.min && p.pct <= band.max);
    const k = inBand.length;
    return {
      ...band,
      picks: k,
      avgShown: k ? r1(inBand.reduce((a, p) => a + p.pct, 0) / k) : null,
      rate: k ? r1((inBand.filter((p) => p.hit).length / k) * 100) : null,
    };
  });

  const byKey = new Map<TopPickKey, { n: number; hits: number }>();
  for (const p of known) {
    const a = byKey.get(p.key) ?? { n: 0, hits: 0 };
    a.n += 1;
    if (p.hit) a.hits += 1;
    byKey.set(p.key, a);
  }
  const markets: MarketBaseline[] = [...byKey]
    .map(([key, a]) => ({
      key,
      picks: a.n,
      hitRate: r1((a.hits / a.n) * 100),
      baseRate: r1(base.get(key)!.rate),
      baseSample: base.get(key)!.sample,
    }))
    .sort((a, b) => b.picks - a.picks);

  return {
    picks: n,
    avgShown: r1(shown / n),
    actualRate: r1((hits / n) * 100),
    baseRate: r1((baseSum / n) * 100),
    brier: r3(brier / n),
    brierBase: r3(brierBase / n),
    skill: brierBase > 0 ? r3(1 - brier / brierBase) : 0,
    bands,
    markets,
  };
}

/**
 * Turnuva grubu (isabet sayfası kırılımı, büyüme raporu 1.3): örneklemin çoğu milli maç olduğu için kulüp maçlarındaki
 * başarı ayrı görünsün. Milli maçlar API-Football'dan gelir, kimlikleri 2e9'dan büyüktür (bkz. config/nationalMatches).
 */
export type CompetitionGroup = 'superLig' | 'turkey' | 'uefa' | 'big5' | 'national' | 'other';
export const COMPETITION_GROUPS: CompetitionGroup[] = ['superLig', 'turkey', 'uefa', 'big5', 'national', 'other'];
const NATIONAL_ID_MIN = 2_000_000_000;

export function competitionGroup(competitionId: string | number | null | undefined, matchId?: string | number | null): CompetitionGroup {
  const id = Number(competitionId);
  if (Number(matchId) >= NATIONAL_ID_MIN || id >= NATIONAL_ID_MIN) return 'national';
  if (id === 600) return 'superLig';
  if (id === 603 || id === 606) return 'turkey';
  if ([2, 5, 2286, 1328].includes(id)) return 'uefa';
  if ([8, 82, 301, 384, 564].includes(id)) return 'big5';
  return 'other';
}
