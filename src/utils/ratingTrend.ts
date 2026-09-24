/**
 * Oyuncu rating grafiği — SAF hesaplamalar (render yok). Web (`PlayerProfile/RatingTrendChart`, SVG) ve mobil
 * (react-native-svg) aynı fonksiyonları kullanır; bileşen yalnızca `ratingChartLayout` çıktısını çizer.
 */
import { isValidRating } from '@/config/ratingScale';
import { countsForAverage, playedIn, type PlayerLineupRow } from '@/utils/playerVs';

/** Grafikte en fazla bu kadar maç: oyuncunun SAHAYA ÇIKTIĞI son tamamlanmış maçlar (takımdan bağımsız). */
export const RATING_TREND_LIMIT = 20;
/** İstikrar etiketi için gereken en az (ortalamaya katılan) reytingli maç. */
export const CONSISTENCY_MIN_MATCHES = 5;

/**
 * İstikrar = reytinglerin (popülasyon) standart sapması σ.
 *   σ < 0.35        → stable   ("İstikrarlı")
 *   0.35 ≤ σ < 0.65 → balanced ("Dengeli")
 *   σ ≥ 0.65        → volatile ("Dalgalı")
 * Gerekçe (2026-09-25, Sportmonks, Galatasaray + Barcelona son 20 maç, ≥5 reytingli 47 oyuncu): σ dağılımı
 * p25 0.36 · medyan 0.41 · p75 0.56 · p85 0.64 · en yüksek 1.08. Eşikler en istikrarlı ~çeyreği ve en dalgalı ~%15'i
 * ayırır; σ 0.35 ≈ maçların ~2/3'ü ortalamanın ±0.35 bandında (ör. 6.6–7.3), σ 0.65 ≈ 6.2–7.5 gibi geniş bir bant.
 */
export const CONSISTENCY_THRESHOLDS = { stable: 0.35, volatile: 0.65 } as const;

export type Consistency = 'stable' | 'balanced' | 'volatile';

export type RatingPoint = {
  matchId: number;
  date?: string;
  isHome: boolean;
  opponent: string;
  opponentLogo?: string;
  /** Ev-deplasman sırasıyla skor ("2-1") */
  score?: string;
  rating: number;
  minutes?: number;
  /** 15 dakikadan az: noktada soluk/işaretli görünür, ortalama/istikrar/en iyi-en kötü hesabına GİRMEZ */
  short: boolean;
};

export type RatingSeries = {
  /** Kronolojik (eski → yeni), yalnızca reytingi olan maçlar */
  points: RatingPoint[];
  /** Sahaya çıktığı ama reytingi gelmeyen maç sayısı (kadroda olup oynamadığı maçlar hiç sayılmaz) */
  missing: number;
  /** 15 dakikanın altında kalan reytingli maç sayısı */
  shortCount: number;
  /** Değerlendirilen (sahaya çıkılan) maç sayısı (≤ limit) */
  considered: number;
};

/**
 * Oyuncunun satırlarından (`PlayerLineupRow`, hangi takımda oynadığından bağımsız — transfer öncesi maçlar dahil):
 * sahaya çıktığı son `limit` maç → reytingsizleri say ve at → eski → yeni sırala. Kadroda olup oynamadığı maç yok sayılır.
 */
export function buildRatingSeries(rows: PlayerLineupRow[], limit = RATING_TREND_LIMIT): RatingSeries {
  const recent = rows
    .filter(playedIn)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
  const rated = recent.filter((r) => isValidRating(r.rating));
  const points: RatingPoint[] = rated
    .map((r) => ({
      matchId: r.fixtureId,
      isHome: r.isHome,
      opponent: r.opponentName,
      rating: r.rating!,
      short: !countsForAverage(r),
      ...(r.date ? { date: r.date.slice(0, 10) } : {}),
      ...(r.opponentLogo ? { opponentLogo: r.opponentLogo } : {}),
      ...(r.goalsFor != null && r.goalsAgainst != null
        ? { score: r.isHome ? `${r.goalsFor}-${r.goalsAgainst}` : `${r.goalsAgainst}-${r.goalsFor}` }
        : {}),
      ...(r.minutes != null ? { minutes: r.minutes } : {}),
    }))
    .reverse();
  return {
    points,
    missing: recent.length - rated.length,
    shortCount: points.filter((p) => p.short).length,
    considered: recent.length,
  };
}

/** Popülasyon standart sapması (gösterilen maçların kendisi — örneklem değil). */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

/** `n < CONSISTENCY_MIN_MATCHES` → `null` (etiket gösterilmez). */
export function consistencyOf(stdDev: number, n: number): Consistency | null {
  if (n < CONSISTENCY_MIN_MATCHES) return null;
  if (stdDev < CONSISTENCY_THRESHOLDS.stable) return 'stable';
  if (stdDev < CONSISTENCY_THRESHOLDS.volatile) return 'balanced';
  return 'volatile';
}

export type RatingSummary = {
  average: number;
  best: RatingPoint;
  worst: RatingPoint;
  stdDev: number;
  consistency: Consistency | null;
};

/**
 * Yalnızca ortalamaya katılan (15'+) noktalardan: ortalama, en iyi/en kötü (eşitlikte en YENİ maç), σ ve istikrar.
 * Hiç katılan nokta yoksa `null` (grafik yine çizilir, özet "—").
 */
export function summarizeRatings(points: RatingPoint[]): RatingSummary | null {
  const counted = points.filter((p) => !p.short);
  if (counted.length === 0) return null;
  const values = counted.map((p) => p.rating);
  const average = values.reduce((s, v) => s + v, 0) / values.length;
  const best = counted.reduce((a, b) => (b.rating >= a.rating ? b : a));
  const worst = counted.reduce((a, b) => (b.rating <= a.rating ? b : a));
  const stdDev = standardDeviation(values);
  return { average, best, worst, stdDev, consistency: consistencyOf(stdDev, counted.length) };
}

export type ChartBox = { width: number; height: number; padTop: number; padRight: number; padBottom: number; padLeft: number };

export type RatingChartLayout = {
  yMin: number;
  yMax: number;
  /** Y ekseni çizgileri/etiketleri */
  ticks: Array<{ value: number; y: number }>;
  dots: Array<RatingPoint & { x: number; y: number }>;
  /** Ortalama çizgisinin y'si (null: veri yok) */
  averageY: number | null;
  /** Noktaları birleştiren polyline `points` özniteliği */
  linePoints: string;
};

/**
 * Y aralığı: 5–10 civarı ama veriye göre — alt sınır min(6, ⌊min − 0.25⌋) (≥ 0), üst sınır max(8, ⌈max + 0.25⌉) (≤ 10).
 * Tipik 6.4–7.6 serisi 6–8 aralığında (farklar okunur), 9.0'lık maç varsa 10'a, 5.3'lük varsa 5'e açılır.
 */
export function ratingYDomain(values: number[]): { yMin: number; yMax: number } {
  if (values.length === 0) return { yMin: 5, yMax: 10 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const yMin = Math.max(0, Math.min(6, Math.floor(lo - 0.25)));
  const yMax = Math.min(10, Math.max(8, Math.ceil(hi + 0.25)));
  return { yMin, yMax };
}

export function ratingChartLayout(points: RatingPoint[], box: ChartBox, average?: number | null): RatingChartLayout {
  const { yMin, yMax } = ratingYDomain(points.map((p) => p.rating));
  const plotW = Math.max(1, box.width - box.padLeft - box.padRight);
  const plotH = Math.max(1, box.height - box.padTop - box.padBottom);
  const yOf = (v: number) => box.padTop + ((yMax - v) / (yMax - yMin)) * plotH;
  // Tek maçta nokta ortada; birden fazlada iki uca yaslanır
  const xOf = (i: number) => (points.length <= 1 ? box.padLeft + plotW / 2 : box.padLeft + (i / (points.length - 1)) * plotW);
  const step = yMax - yMin > 3 ? 1 : 0.5;
  const ticks: RatingChartLayout['ticks'] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push({ value: Math.round(v * 10) / 10, y: yOf(v) });
  const dots = points.map((p, i) => ({ ...p, x: xOf(i), y: yOf(p.rating) }));
  return {
    yMin,
    yMax,
    ticks,
    dots,
    averageY: average != null && points.length > 0 ? yOf(average) : null,
    linePoints: dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' '),
  };
}
