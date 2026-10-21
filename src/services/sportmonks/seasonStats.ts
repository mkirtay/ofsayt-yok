/**
 * Lig / kupa "Sezon Özeti" — saf dönüştürücüler (ağ yok). Kaynak (2026-10-21 gerçek isteklerle, SL 28203 / ŞL 28155 /
 * TK 28283 / ŞL 25/26 25580):
 *
 * `seasons/{id}?include=statistics.participant` (Season havuzu, tek istek, ~10–11 KB): sezon alanları (`finished`, `ending_at`,
 * `league_id`) + 29–31 satır `{type_id, relation_id, value}` — Haftanın Özeti (statistics/rounds) ile AYNI şekil, ek olarak
 * kaleci gol yememe (195), en çok gol yiyen takım (205), kart kralı (210), korner/şut/ikili mücadele gibi toplamlar.
 * `participant` include'u çok biçimli (takım ya da oyuncu, `image_path` dahil); `statistics.type` gereksiz (tür id'leri sabit).
 *
 * Güvenilmeyen veri gizlenir: kupada sarı kart 0 (bkz. roundStats kart kuralı), ŞL'de kaleci gol yememe "2/2 maç" (Sportmonks
 * yalnız son birkaç maça bakıyor gibi) → en az 3 maç şartı; kart kralı en az 2 kart.
 */
import {
  ROUND_STAT_TYPES,
  cleanStatImage,
  statEntity,
  summarizeRoundStatistics,
  type RawRoundStatistic,
  type RoundStatsSummary,
  type StatEntity,
} from './roundStats';

export const SEASON_STAT_TYPES = {
  ...ROUND_STAT_TYPES,
  GOALKEEPER_CLEANSHEET: 195,
  PARTICIPANT_MOST_CONCEDED: 205,
  CARD_TOPSCORER: 210,
} as const;

export const SEASON_STATS_INCLUDE = 'statistics.participant';

export type RawSeasonWithStatistics = {
  id: number;
  league_id?: number | null;
  name?: string | null;
  finished?: boolean | null;
  is_current?: boolean | null;
  starting_at?: string | null;
  ending_at?: string | null;
  statistics?: RawRoundStatistic[] | null;
};

export type SeasonStatsSummary = RoundStatsSummary & {
  mostConcededTeam: (StatEntity & { goals: number }) | null;
  /** Yalnız 2+ kartla. */
  topCards: (StatEntity & { cards: number }) | null;
  /** Yalnız 3+ gol yemediği maçla (Sportmonks kupada 2/2 gibi anlamsız değer veriyor). */
  cleanSheetKeeper: (StatEntity & { cleanSheets: number; games: number | null }) | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function counted(row: RawRoundStatistic | undefined, idKey: string, nameKey: string, min: number): (StatEntity & { count: number }) | null {
  const count = num(obj(row?.value)?.count);
  const e = statEntity(row, idKey, nameKey);
  if (!e || count == null || count < min) return null;
  return { ...e, image: cleanStatImage(e.image), count };
}

/** Ham sezon istatistiği → kart özeti. Oynanmış maç yoksa (başlamamış sezon, boş yanıt) `null` — "veri yok". */
export function summarizeSeasonStatistics(rows: readonly RawRoundStatistic[] | null | undefined): SeasonStatsSummary | null {
  const base = summarizeRoundStatistics(rows);
  if (!base || !rows) return null;
  const by = new Map<number, RawRoundStatistic>();
  for (const r of rows) if (r && typeof r.type_id === 'number' && !by.has(r.type_id)) by.set(r.type_id, r);

  const conceded = counted(by.get(SEASON_STAT_TYPES.PARTICIPANT_MOST_CONCEDED), 'participant_id', 'participant_name', 1);
  const cards = counted(by.get(SEASON_STAT_TYPES.CARD_TOPSCORER), 'player_id', 'player_name', 2);
  const keeperRow = by.get(SEASON_STAT_TYPES.GOALKEEPER_CLEANSHEET);
  const keeper = counted(keeperRow, 'player_id', 'player_name', 3);

  return {
    ...base,
    mostConcededTeam: conceded ? { id: conceded.id, name: conceded.name, image: conceded.image, goals: conceded.count } : null,
    topCards: cards ? { id: cards.id, name: cards.name, image: cards.image, cards: cards.count } : null,
    cleanSheetKeeper: keeper
      ? { id: keeper.id, name: keeper.name, image: keeper.image, cleanSheets: keeper.count, games: num(obj(keeperRow?.value)?.total_games) }
      : null,
  };
}

function addDays(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Sezon bitti mi (veri artık değişmez): Sportmonks `finished` bayrağı ya da bitiş tarihinden 2 gün geçmiş olması.
 * @param today TSİ günü `YYYY-MM-DD`
 */
export function seasonStatsFinished(season: Pick<RawSeasonWithStatistics, 'finished' | 'ending_at'> | null | undefined, today: string): boolean {
  if (!season) return false;
  if (season.finished === true) return true;
  const end = typeof season.ending_at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(season.ending_at) ? season.ending_at.slice(0, 10) : null;
  return end != null && addDays(end, 2) <= today;
}
