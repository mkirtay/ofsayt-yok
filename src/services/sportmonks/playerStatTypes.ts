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

/**
 * `labelKey`: `public/locales/{tr,en}/player.json` içindeki `stats.<labelKey>` anahtarı —
 * GÖSTERİLEN metin oradan gelir (bkz. `PlayerProfile`). `label` Türkçe yedek olarak kalır: bu
 * modül saf veri (React/i18n bağımlılığı yok) ve çeviri yoksa ekranda ham anahtar görünmesin.
 */
export type PlayerStatDef = { id: number; labelKey: string; label: string; format?: PlayerStatFormat };
/** `key` aynı zamanda `player.statGroups.<key>` çeviri anahtarıdır. */
export type PlayerStatGroup = { key: string; title: string; stats: PlayerStatDef[] };

export const PLAYER_STAT_GROUPS: PlayerStatGroup[] = [
  {
    key: 'shots',
    title: 'Şut & Hücum',
    stats: [
      { id: 42, labelKey: 'totalShots', label: 'Toplam şut' },
      { id: 86, labelKey: 'shotsOnTarget', label: 'İsabetli şut' },
      { id: 41, labelKey: 'shotsOffTarget', label: 'İsabetsiz şut' },
      { id: 58, labelKey: 'shotsBlocked', label: 'Engellenen şut' },
      { id: 580, labelKey: 'bigChancesCreated', label: 'Büyük şans yaratma' },
      { id: 581, labelKey: 'bigChancesMissed', label: 'Büyük şans kaçırma' },
      { id: 47, labelKey: 'penalties', label: 'Penaltı (gol/toplam)', format: 'ratio' },
      { id: 51, labelKey: 'offsides', label: 'Ofsayt' },
    ],
  },
  {
    key: 'passing',
    title: 'Pas',
    stats: [
      { id: 80, labelKey: 'passes', label: 'Pas' },
      { id: 116, labelKey: 'accuratePasses', label: 'İsabetli pas' },
      { id: 1584, labelKey: 'passAccuracy', label: 'Pas isabeti', format: 'percent' },
      { id: 117, labelKey: 'keyPasses', label: 'Kilit pas' },
      { id: 98, labelKey: 'crosses', label: 'Orta' },
      { id: 99, labelKey: 'accurateCrosses', label: 'İsabetli orta' },
    ],
  },
  {
    key: 'defending',
    title: 'Savunma & İkili Mücadele',
    stats: [
      { id: 105, labelKey: 'totalDuels', label: 'Toplam ikili mücadele' },
      { id: 106, labelKey: 'duelsWon', label: 'Kazanılan ikili mücadele' },
      { id: 107, labelKey: 'aerialsWon', label: 'Kazanılan hava topu' },
      { id: 100, labelKey: 'interceptions', label: 'Araya girme' },
      { id: 101, labelKey: 'clearances', label: 'Uzaklaştırma' },
      { id: 110, labelKey: 'dribbledPast', label: 'Geçilme (dribling)' },
      { id: 27255, labelKey: 'crossesBlocked', label: 'Engellenen orta' },
    ],
  },
  {
    key: 'individual',
    title: 'Bireysel',
    stats: [
      { id: 108, labelKey: 'dribbleAttempts', label: 'Dribling denemesi' },
      { id: 109, labelKey: 'successfulDribbles', label: 'Başarılı dribling' },
      { id: 94, labelKey: 'dispossessed', label: 'Top kaybı' },
      { id: 96, labelKey: 'foulsDrawn', label: 'Kazanılan faul' },
    ],
  },
  {
    key: 'discipline',
    title: 'Disiplin & Takım',
    stats: [
      { id: 56, labelKey: 'fouls', label: 'Faul' },
      { id: 87, labelKey: 'injuries', label: 'Sakatlık' },
      { id: 88, labelKey: 'goalsConceded', label: 'Yenilen gol' },
      { id: 194, labelKey: 'cleanSheets', label: 'Gol yemeden bitirilen maç' },
      { id: 214, labelKey: 'teamWins', label: 'Takım galibiyeti' },
      { id: 215, labelKey: 'teamDraws', label: 'Takım beraberliği' },
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

/**
 * UI metni: rating tek ondalık, penaltı "1/1", diğerleri tam sayı. Değer yoksa `null`.
 * Yüzde işaretinin yeri dile bağlı: Türkçe'de önde ("%86.7"), İngilizce'de sonda ("86.7%").
 * `locale` verilmezse Türkçe — saf fonksiyon olarak doğrudan da çağrılabilsin diye.
 */
export function formatStat(
  value: PlayerStatValue,
  format: PlayerStatFormat = 'total',
  locale?: string,
): string | null {
  if (value == null) return null;
  if (format === 'ratio' && typeof value === 'object') {
    const scored = num(value.scored);
    const total = num(value.total);
    return scored != null && total != null ? `${scored}/${total}` : null;
  }
  const n = statMain(value, format);
  if (n == null) return null;
  if (format === 'rating') return n.toFixed(2);
  if (format === 'percent') {
    const num = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return locale === 'en' ? `${num}%` : `%${num}`;
  }
  return String(Number.isInteger(n) ? n : Math.round(n * 10) / 10);
}
