/**
 * Kupa eleme ağacı (sunucu): sezon başına TEK Sportmonks isteği (Stage havuzu) + saf dönüştürücü.
 *
 * İstek: `stages/seasons/{s}?include=aggregates;fixtures:…;fixtures.participants:name,image_path;fixtures.scores:…`
 * + `filters=scoreTypes:1525,5` (yalnız CURRENT + penaltı; filtresiz ŞL 25/26 567 KB → 311 KB). Ham yanıt paylaşımlı
 * cache'te gzip'li durur (ŞL ~25 KB, KL ~40 KB; Redis'e yazılan budur) ve süresi içeriğe göre
 * (cachePolicy `cupStagesTtl`: canlı eleme maçı 5 dk, eleme günü ≤ 1 sa, diğer günler ≤ 12 sa, biten sezon 30 gün).
 * Ağaç her istekte yeniden kurulur (ms mertebesi); API yanıtı CDN'de aynı süreyle tutulur.
 *
 * `seasons/{id}/brackets` (edges) yalnız Dünya Kupası'nda dolu, ŞL/TK/AL/KL'de boş (2026-10-21) → İSTENMEZ;
 * bağlantı takım eşlemesiyle türetilir. `schedules/seasons` TK'da tur maçlarını boş döndürüyor → kullanılmaz.
 *
 * Sezon kimliği ligin sezon listesinden doğrulanır (`leagues/{id}?include=seasons`, Puan Durumu ile aynı önbellek
 * anahtarı) — keyfi sezon id'siyle kota yakılamasın.
 */
import { CUP_BRACKET_TEMPLATES, hasCupBracket } from '@/config/cupBrackets';
import { buildCupBracket, type RawStage } from '@/services/cupBracket/buildCupBracket';
import type { CupBracket } from '@/services/cupBracket/types';
import { cupStagesTtl } from '@/services/sportmonks/cachePolicy';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';

export const CUP_STAGES_INCLUDE =
  'aggregates;fixtures:leg,aggregate_id,placeholder,state_id,starting_at;fixtures.participants:name,image_path;fixtures.scores:participant_id,score';
export const CUP_STAGES_FILTERS = 'scoreTypes:1525,5';

export type CupBracketResult =
  /** `bracket: null` = bu sezonda eleme verisi yok (sekme gizlenir). */
  | { ok: true; bracket: CupBracket | null; freshSeconds: number }
  | { ok: false; reason: 'unsupported' | 'unknownSeason' };

type LeagueWithSeasons = { id: number; seasons?: { id: number; is_current?: boolean | null }[] | null };

/** Hata (429 / 5xx / zaman aşımı) FIRLATIR — "veri yok" ile karışmasın. */
export async function loadCupBracket(leagueId: number, seasonId: number | null, now: number = Date.now()): Promise<CupBracketResult> {
  if (!hasCupBracket(leagueId)) return { ok: false, reason: 'unsupported' };
  // Puan Durumu / yan panel ile AYNI istek (aynı önbellek anahtarı).
  const league = await sportmonksClientRequest<LeagueWithSeasons>('football', `/leagues/${leagueId}`, { include: 'seasons' });
  const seasons = league.data?.seasons ?? [];
  const season = seasonId != null ? seasons.find((s) => s.id === seasonId) : seasons.find((s) => s.is_current);
  if (!season) return { ok: false, reason: 'unknownSeason' };

  const envelope = await sportmonksClientRequest<RawStage[]>('football', `/stages/seasons/${season.id}`, {
    include: CUP_STAGES_INCLUDE,
    filters: CUP_STAGES_FILTERS,
  });
  const stages = Array.isArray(envelope.data) ? envelope.data : [];
  const bracket = buildCupBracket({ leagueId, seasonId: season.id, stages, template: CUP_BRACKET_TEMPLATES[leagueId]! });
  return { ok: true, bracket, freshSeconds: cupStagesTtl(stages, now).fresh };
}
