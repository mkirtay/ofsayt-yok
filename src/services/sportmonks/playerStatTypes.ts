/**
 * Oyuncu sezon istatistiği (`players/{id}?include=statistics.details.type`) type_id sözlüğü — 2026-09-19'da gerçek
 * Süper Lig 2026/27 verisiyle (Osimhen) 39 tip listelendi. Gol Krallığı'nda kullanılan 321 (APPEARANCES), 79 (ASSISTS)
 * ile aynı id'ler; Maç Detayı istatistik bölümüyle tutarlı gruplama (şut / pas / savunma-mücadele / bireysel / disiplin).
 *
 * xG/xGOT ve piyasa değeri Sportmonks planında YOK (403/404) — bu sözlükte ve UI'da hiç yer almaz.
 * Değer şekilleri tipe göre değişir: çoğu `{ total }`; 118 RATING `{ average, highest, lowest }`; 47 PENALTIES
 * `{ total, scored, ... }`; 52 GOALS `{ total, goals, penalties }`; 59 SUBSTITUTIONS `{ in, out }`.
 */

export const STAT = {
  APPEARANCES: 321,
  LINEUPS: 322,
  MINUTES: 119,
  GOALS: 52,
  ASSISTS: 79,
  RATING: 118,
} as const;

export type PlayerStatValue = Record<string, number | string | boolean | null> | number | string | null | undefined;

export type PlayerStatFormat = 'total' | 'percent' | 'rating' | 'ratio';

export type PlayerStatDef = { id: number; label: string; format?: PlayerStatFormat };
export type PlayerStatGroup = { key: string; title: string; stats: PlayerStatDef[] };

export const PLAYER_STAT_GROUPS: PlayerStatGroup[] = [
  {
    key: 'shots',
    title: 'Şut & Hücum',
    stats: [
      { id: 42, label: 'Toplam şut' },
      { id: 86, label: 'İsabetli şut' },
      { id: 41, label: 'İsabetsiz şut' },
      { id: 58, label: 'Engellenen şut' },
      { id: 580, label: 'Büyük şans yaratma' },
      { id: 581, label: 'Büyük şans kaçırma' },
      { id: 47, label: 'Penaltı (gol/toplam)', format: 'ratio' },
      { id: 51, label: 'Ofsayt' },
    ],
  },
  {
    key: 'passing',
    title: 'Pas',
    stats: [
      { id: 80, label: 'Pas' },
      { id: 116, label: 'İsabetli pas' },
      { id: 1584, label: 'Pas isabeti', format: 'percent' },
      { id: 117, label: 'Kilit pas' },
      { id: 98, label: 'Orta' },
      { id: 99, label: 'İsabetli orta' },
    ],
  },
  {
    key: 'defending',
    title: 'Savunma & İkili Mücadele',
    stats: [
      { id: 105, label: 'Toplam ikili mücadele' },
      { id: 106, label: 'Kazanılan ikili mücadele' },
      { id: 107, label: 'Kazanılan hava topu' },
      { id: 100, label: 'Araya girme' },
      { id: 101, label: 'Uzaklaştırma' },
      { id: 110, label: 'Geçilme (dribling)' },
      { id: 27255, label: 'Engellenen orta' },
    ],
  },
  {
    key: 'individual',
    title: 'Bireysel',
    stats: [
      { id: 108, label: 'Dribling denemesi' },
      { id: 109, label: 'Başarılı dribling' },
      { id: 94, label: 'Top kaybı' },
      { id: 96, label: 'Kazanılan faul' },
    ],
  },
  {
    key: 'discipline',
    title: 'Disiplin & Takım',
    stats: [
      { id: 56, label: 'Faul' },
      { id: 87, label: 'Sakatlık' },
      { id: 88, label: 'Yenilen gol' },
      { id: 194, label: 'Gol yemeden bitirilen maç' },
      { id: 214, label: 'Takım galibiyeti' },
      { id: 215, label: 'Takım beraberliği' },
    ],
  },
];

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number.parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Değerin ana sayısını çıkarır (`total` / `average` / düz sayı); yoksa `null` (UI "—" ya da satırı gizler). */
export function statMain(value: PlayerStatValue, format: PlayerStatFormat = 'total'): number | null {
  if (value == null) return null;
  if (typeof value !== 'object') return num(value);
  if (format === 'rating') return num(value.average);
  return num(value.total) ?? num(value.average) ?? num(value.goals);
}

/** UI metni: rating tek ondalık, yüzde "%86,7", penaltı "1/1", diğerleri tam sayı. Değer yoksa `null`. */
export function formatStat(value: PlayerStatValue, format: PlayerStatFormat = 'total'): string | null {
  if (value == null) return null;
  if (format === 'ratio' && typeof value === 'object') {
    const scored = num(value.scored);
    const total = num(value.total);
    return scored != null && total != null ? `${scored}/${total}` : null;
  }
  const n = statMain(value, format);
  if (n == null) return null;
  if (format === 'rating') return n.toFixed(2);
  if (format === 'percent') return `%${Number.isInteger(n) ? n : n.toFixed(1)}`;
  return String(Number.isInteger(n) ? n : Math.round(n * 10) / 10);
}
