/**
 * Maç momentumu (baskı grafiği) — Sportmonks `trends` (dakika bazlı takım istatistiği) → dakika başına ev − deplasman
 * baskı farkı. Sunucuda hesaplanır; istemciye yalnız dakika başına bir tam sayı (−100…100) gider (~95 nokta).
 *
 * Veri (2026-10-21, SL 19746587 + 1. Lig 4 maç, gerçek istek): `trends` satırı = {participant_id, type_id, period_id,
 * minute, value}; `value` o dakikadaki KÜMÜLATİF toplam ve yalnız değiştiği dakikada satır var (her dakika değil; ara
 * sıra birden fazla artış tek satırda — ör. korner 0→3). `filters=trendTypes:44,42,34` çalışıyor (1219 → 99 satır,
 * 235 → 13 KB). Dakika gerçek süre: 1. devrenin uzatması 46', 2. devre 95'e kadar; `periods[].counts_from` devre
 * başlangıcı (0 / 45 / 90 / 105).
 *
 * Baskı = tehlikeli atak ×1 + şut ×3 + korner ×1 (artış başına), dakikalık fark hafif yumuşatılır (5 dakikalık üçgen
 * çekirdek, devre içinde), maçın en büyük mutlak değerine göre −100…100'e ölçeklenir (sessiz maçta gürültü büyümesin
 * diye tabanı MIN_SCALE).
 */

import type { MomentumColors } from './momentumColors';

export const MOMENTUM_TREND_TYPES = { DANGEROUS_ATTACKS: 44, SHOTS_TOTAL: 42, CORNERS: 34 } as const;

const WEIGHTS: Record<number, number> = {
  [MOMENTUM_TREND_TYPES.DANGEROUS_ATTACKS]: 1,
  [MOMENTUM_TREND_TYPES.SHOTS_TOTAL]: 3,
  [MOMENTUM_TREND_TYPES.CORNERS]: 1,
};

/** Yumuşatma çekirdeği (merkez ± 2 dk). */
const KERNEL = [1, 2, 3, 2, 1];
/** Ölçek tabanı: yumuşatılmış dakikalık fark bundan küçükse grafik tam boya çıkmaz. */
const MIN_SCALE = 3;
/** Bundan az satır = veri yok sayılır (ör. yalnız açılış satırları). */
const MIN_ROWS = 6;

/** Sportmonks periods.type_id: 1/2 devre, 3/4 uzatma devreleri; 5 = penaltılar (dahil değil). */
const PLAYABLE_PERIOD_TYPES = new Set([1, 2, 3, 4]);

export type TrendRow = {
  participant_id?: number | null;
  type_id?: number | null;
  period_id?: number | null;
  minute?: number | null;
  value?: number | string | null;
};

export type PeriodRow = {
  id: number;
  type_id?: number | null;
  sort_order?: number | null;
  counts_from?: number | null;
  period_length?: number | null;
  minutes?: number | null;
  ended?: number | null;
};

export type MomentumInput = {
  trends?: TrendRow[] | null;
  periods?: PeriodRow[] | null;
  homeId: number | null;
  awayId: number | null;
};

export type MomentumSegment = {
  /** Devrenin başladığı maç dakikası (0, 45, 90, 105). */
  from: number;
  /** Eksen uzunluğu (dakika): planlanan süre ya da (uzatmayla) oynanan, hangisi büyükse. */
  length: number;
  /** Bu devrenin `points` dizisindeki ilk indeksi. */
  start: number;
  /** Bu devrede veri olan dakika sayısı (canlıda sürmekte olan devrede < length). */
  played: number;
};

export type MatchMomentum = {
  /** Dakika başına baskı: + ev, − deplasman, −100…100. Devreler art arda (bkz. `segments`). */
  points: number[];
  segments: MomentumSegment[];
};

/** `/api/matches/[id]/momentum` yanıtı. `colors` null → tasarım token'ları (bkz. momentumColors.ts). */
export type MatchMomentumResponse = MatchMomentum & { live: boolean; colors: MomentumColors | null };

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function smooth(values: number[]): number[] {
  const half = Math.floor(KERNEL.length / 2);
  return values.map((_, i) => {
    let sum = 0;
    let w = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j < 0 || j >= values.length) continue;
      const kw = KERNEL[k + half]!;
      sum += values[j]! * kw;
      w += kw;
    }
    return w ? sum / w : 0;
  });
}

/** Veri yetersizse `null` (bileşen hiç görünmez). */
export function computeMomentum({ trends, periods, homeId, awayId }: MomentumInput): MatchMomentum | null {
  if (homeId == null || awayId == null || !Array.isArray(trends) || trends.length < MIN_ROWS) return null;
  const playable = (periods ?? [])
    .filter((p) => p && PLAYABLE_PERIOD_TYPES.has(p.type_id ?? -1))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (playable.length === 0) return null;
  const periodIndex = new Map(playable.map((p, i) => [p.id, i]));

  // Devre içi dakika ofseti (0 = devre başlangıcı) + KÜMÜLATİF değerden artış.
  type Row = { seg: number; offset: number; team: number; type: number; value: number };
  const rows: Row[] = [];
  for (const r of trends) {
    const seg = periodIndex.get(r.period_id ?? -1);
    const team = r.participant_id;
    const type = r.type_id ?? -1;
    const minute = num(r.minute);
    const value = num(r.value);
    if (seg == null || (team !== homeId && team !== awayId) || !(type in WEIGHTS) || minute == null || value == null) continue;
    const from = num(playable[seg]!.counts_from) ?? 0;
    rows.push({ seg, offset: Math.max(0, minute - from), team: team!, type, value });
  }
  if (rows.length < MIN_ROWS) return null;
  rows.sort((a, b) => a.seg - b.seg || a.offset - b.offset || a.value - b.value);

  const segments: MomentumSegment[] = playable.map((p, i) => {
    const from = num(p.counts_from) ?? 0;
    const planned = num(p.period_length) ?? (i < 2 ? 45 : 15);
    const lastOffset = rows.reduce((m, r) => (r.seg === i ? Math.max(m, r.offset) : m), -1);
    const ended = num(p.ended) != null;
    const clock = num(p.minutes);
    // Biten devrenin gerçek süresi (uzatma dahil) `minutes - counts_from`; sürmekte olanda son veri dakikası.
    const played = Math.max(lastOffset + 1, ended && clock != null ? clock - from : 0, 0);
    return { from, length: Math.max(planned, played), start: 0, played };
  });
  let start = 0;
  for (const s of segments) {
    s.start = start;
    start += s.played;
  }

  const raw = new Array<number>(start).fill(0);
  const last = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.team}:${r.type}`;
    const prev = last.get(key) ?? 0;
    last.set(key, Math.max(prev, r.value));
    const delta = r.value - prev;
    if (delta <= 0) continue;
    const seg = segments[r.seg]!;
    const idx = seg.start + Math.min(r.offset, seg.played - 1);
    raw[idx]! += (r.team === homeId ? 1 : -1) * delta * WEIGHTS[r.type]!;
  }

  const smoothed = segments.flatMap((s) => smooth(raw.slice(s.start, s.start + s.played)));
  const scale = Math.max(MIN_SCALE, ...smoothed.map(Math.abs));
  const points = smoothed.map((v) => Math.round((v / scale) * 100) || 0);
  if (points.every((p) => p === 0)) return null;
  return { points, segments };
}
