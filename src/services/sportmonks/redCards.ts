/**
 * Kırmızı kart sayısı — ana sayfa listesi, canlı ticker ve maç başlığındaki kart ikonu için.
 *
 * Liste istekleri (`fixtures/date/{d}`, `livescores/inplay`) olayları süzgeçli ve alan seçimli alır: yalnız kırmızı kart
 * olayları (20 doğrudan kırmızı, 21 ikinci sarıdan kırmızı), yalnız takım/dakika/iptal alanları. Ek istek yok (olaylar
 * sayfalamayı değiştirmez); 2026-10-11 canlı ölçüm: yanıt ham +%0,8–1,6, gzip +%1,7–2,5. Maç detayı tüm olayları
 * zaten alıyor (`events`), sayım aynı fonksiyonla yapılır.
 *
 * Sayılmayan: `rescinded` (VAR ile geri alınan) ve teknik direktör kartı (`coach_id` dolu, `player_id` yok — takım
 * eksik kalmaz). Yedek kulübesinden atılan oyuncu sayılır (olay takımın kırmızı kartı).
 */
import type { MatchRedCards } from '@/models/liveScore';
import type { SportmonksEventRow } from './types';

export const RED_CARD_EVENT_TYPE_IDS: ReadonlySet<number> = new Set([20, 21]);

/** Liste isteklerine eklenen include (alan seçimi; Sportmonks `id`/`fixture_id` gibi temel alanları yine de ekliyor). */
export const RED_CARD_EVENTS_INCLUDE = 'events:type_id,participant_id,player_id,coach_id,minute,extra_minute,rescinded';
/** `events` include'unu yalnız kırmızı kart olaylarına indirir; maçları süzmez (olaysız maç da gelir). */
export const RED_CARD_EVENTS_FILTER = 'eventTypes:20,21';

type RedCardEvent = Pick<SportmonksEventRow, 'type_id' | 'participant_id' | 'player_id' | 'coach_id' | 'rescinded'>;

export function isCountedRedCard(e: RedCardEvent): boolean {
  if (!RED_CARD_EVENT_TYPE_IDS.has(e.type_id) || e.rescinded) return false;
  return !(e.coach_id != null && e.player_id == null);
}

/**
 * Takım başına kırmızı kart. `events` yoksa (include istenmedi) `undefined` → alan yazılmaz, "bilinmiyor"; olaylar geldiyse
 * kart olmasa da `{ home: 0, away: 0 }`.
 */
export function countRedCards(
  events: readonly RedCardEvent[] | null | undefined,
  homeId: number | undefined,
  awayId: number | undefined,
): MatchRedCards | undefined {
  if (!Array.isArray(events) || homeId == null || awayId == null) return undefined;
  const out: MatchRedCards = { home: 0, away: 0 };
  for (const e of events) {
    if (!isCountedRedCard(e)) continue;
    if (e.participant_id === homeId) out.home += 1;
    else if (e.participant_id === awayId) out.away += 1;
  }
  return out;
}
