/**
 * `participant_id`/`team_id` değerini fixture'ın `participants[].meta.location`'ıyla
 * eşleyip `'home'|'away'` döner.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 4 — `getMatchStats` (`statistics[].
 * participant_id`), `getMatchWithEvents` (`events[].participant_id`),
 * `getMatchLineups` (`lineups[].team_id`) üçünde de AYNI mantık tekrarlanıyor:
 * ilgili satırın id'sini fixture'ın üst seviye `participants[]` dizisinde arayıp
 * `meta.location`'ı okumak. Bu modül o tekrarı tek bir yerde topluyor.
 */
import type { SportmonksParticipant } from './types';

export function resolveParticipantLocation(
  participantId: number | null | undefined,
  participants: SportmonksParticipant[] | undefined | null,
): 'home' | 'away' | null {
  if (participantId == null) return null;
  const found = participants?.find((p) => p.id === participantId);
  return found?.meta?.location ?? null;
}
