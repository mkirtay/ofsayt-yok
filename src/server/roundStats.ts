/**
 * Lig sayfası "Haftanın Özeti" kartı (bkz. pages/api/leagues/round-stats.ts, services/sportmonks/roundStats.ts).
 *
 * İstekler (hepsi paylaşımlı Sportmonks önbelleğinden, bkz. cachePolicy):
 * - `leagues/{id}?include=seasons` — sezon gerçekten bu lige mi ait (puan durumu sayfasıyla AYNI anahtar; ek istek yok).
 * - `stages/seasons/{season}?include=rounds:…` — birim listesi (Stage havuzu, 24 sa).
 * - `statistics/rounds/{id}` ya da `statistics/stages/{id}` + `include=participant` (RoundStatistic / StageStatistic havuzu).
 * Hesaplanmış özet Redis SWR'de (`swrCache`): bitmiş hafta 7 gün, süren / yeni biten hafta 2 sa taze.
 *
 * Hata ≠ veri yok: Sportmonks hatası fırlatılır (uç 502 döner, önbelleğe yazılmaz); oynanmamış hafta `summary: null`.
 */
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import {
  buildStatUnits,
  istanbulToday,
  pickDefaultStatUnit,
  statUnitKey,
  summarizeRoundStatistics,
  type RawRoundStatistic,
  type RawSeasonStage,
  type RoundStatsSummary,
  type StatUnit,
  type StatUnitKind,
  type StatUnitMode,
} from '@/services/sportmonks/roundStats';
import { loadWithSwr, type SwrOptions } from '@/server/swrCache';

/**
 * Kupa / eleme turnuvaları: aşama özeti (statistics/stages). Avrupa kupaları (ŞL lig aşaması dahil — tek özet), Türkiye Kupası,
 * İspanya Kral Kupası, UEFA Süper Kupa. Diğer ligler hafta özeti.
 */
export const STAGE_MODE_LEAGUE_IDS: ReadonlySet<number> = new Set([2, 5, 2286, 1328, 606, 570]);

export const ROUND_STATS_STAGES_INCLUDE = 'rounds:name,starting_at,ending_at';
export const ROUND_STATS_INCLUDE = 'participant';

const HOUR = 3600;
const DAY = 24 * HOUR;

export class RoundStatsInputError extends Error {}

export type RoundStatsPayload = {
  mode: StatUnitMode;
  units: StatUnit[];
  /** Gösterilen birimin anahtarı (`r…` / `s…`); birim yoksa null. */
  selected: string | null;
  summary: RoundStatsSummary | null;
};

export function statModeForLeague(leagueId: number): StatUnitMode {
  return STAGE_MODE_LEAGUE_IDS.has(leagueId) ? 'stages' : 'rounds';
}

/** Bitişinden 2 gün geçmiş birim değişmez (puan/istatistik düzeltmeleri bitti) → 7 gün; süren / yeni biten → 2 sa. */
export function roundStatsSwrOptions(unit: Pick<StatUnit, 'end'>, today: string): SwrOptions {
  const settled = unit.end != null && addDays(unit.end, 2) <= today;
  return settled ? { freshSeconds: 7 * DAY, keepSeconds: 30 * DAY } : { freshSeconds: 2 * HOUR, keepSeconds: 7 * DAY };
}

function addDays(isoDay: string, days: number): string {
  const t = Date.parse(`${isoDay}T00:00:00Z`) + days * DAY * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

function summaryKey(kind: StatUnitKind, id: number): string {
  return `${cacheKeyPrefix()}round-stats:v1:${kind}:${id}`;
}

export async function seasonBelongsToLeague(leagueId: number, seasonId: number): Promise<boolean> {
  const envelope = await sportmonksClientRequest<{ id: number; seasons?: { id: number }[] }>('football', `/leagues/${leagueId}`, {
    include: 'seasons',
  });
  const seasons = envelope.data && !Array.isArray(envelope.data) ? (envelope.data.seasons ?? []) : [];
  return seasons.some((s) => s.id === seasonId);
}

async function loadSeasonStages(seasonId: number): Promise<RawSeasonStage[]> {
  const envelope = await sportmonksClientRequest<RawSeasonStage[]>('football', `/stages/seasons/${seasonId}`, {
    include: ROUND_STATS_STAGES_INCLUDE,
  });
  return Array.isArray(envelope.data) ? envelope.data : [];
}

async function computeSummary(kind: StatUnitKind, id: number): Promise<{ s: RoundStatsSummary | null }> {
  const path = kind === 'round' ? `/statistics/rounds/${id}` : `/statistics/stages/${id}`;
  const envelope = await sportmonksClientRequest<RawRoundStatistic[]>('football', path, { include: ROUND_STATS_INCLUDE });
  // "Sonuç yok" (data alanı yok) da veri yok sayılır; HTTP hatası sportmonksRequest'te fırlar.
  return { s: summarizeRoundStatistics(Array.isArray(envelope.data) ? envelope.data : []) };
}

/**
 * @param unitKey `r…`/`s…`; verilmezse varsayılan birim (lig: son tamamlanan hafta, kupa: son başlamış aşama).
 * @throws RoundStatsInputError lig planda değil / sezon o ligin değil / birim o sezonda yok (uç 400/404)
 */
export async function loadRoundStats(leagueId: number, seasonId: number, unitKey: string | null, now: number = Date.now()): Promise<RoundStatsPayload> {
  if (!HUB_LEAGUE_IDS.includes(leagueId)) throw new RoundStatsInputError('league');
  if (!(await seasonBelongsToLeague(leagueId, seasonId))) throw new RoundStatsInputError('season');

  const mode = statModeForLeague(leagueId);
  const today = istanbulToday(now);
  const units = buildStatUnits(await loadSeasonStages(seasonId), mode, today);
  const unit = unitKey == null ? pickDefaultStatUnit(units, mode) : (units.find((u) => statUnitKey(u) === unitKey) ?? null);
  if (unitKey != null && unit == null) throw new RoundStatsInputError('unit');
  if (!unit) return { mode, units, selected: null, summary: null };

  let failure: unknown = null;
  const result = await loadWithSwr(summaryKey(unit.kind, unit.id), roundStatsSwrOptions(unit, today), async () => {
    try {
      return await computeSummary(unit.kind, unit.id);
    } catch (e) {
      failure = e;
      return null;
    }
  });
  if (!result) throw failure ?? new Error('round-stats: özet üretilemedi');
  return { mode, units, selected: statUnitKey(unit), summary: result.value.s };
}
