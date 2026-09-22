/**
 * Onay anı VAR yeniden doğrulaması (SAF). Taslak üretildikten sonra fixture'ın güncel olaylarıyla karşılaştırılır:
 * (a) aynı eventId hâlâ aynı türde gol olarak listeleniyor mu, (b) oyuncu/dakika aynı mı, (c) golden kısa süre sonra aynı takım için
 * VAR (tip 10) olayı var mı (sezgisel pencere: `VAR_WINDOW_MINUTES`), (d) o ana kadarki skor taslaktakiyle aynı mı.
 * Herhangi biri bozuksa taslak STALE olur ve YAYINLANMAZ (muhafazakâr: yanlış-olumlu "eski" sonucu, yanlış yayından iyidir).
 */
import { VAR_WINDOW_MINUTES } from '@/config/gundemBot';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { eventsUpTo, goalKindOf, scoreAtEvent, sortEvents } from './goalStanding';
import type { GoalFacts } from './goalTemplates';

export const EVENT_TYPE_VAR = 10;

export type StaleReason = 'event-missing' | 'not-a-goal' | 'kind-changed' | 'player-changed' | 'minute-changed' | 'var-after-goal' | 'score-changed' | 'no-participants';

export type VerifyResult = { ok: true; scorerTeamId: number | null } | { ok: false; reason: StaleReason };

export function verifyGoalStillValid(draft: { eventId: number; facts: GoalFacts }, fixture: SportmonksFixture): VerifyResult {
  const events = fixture.events ?? [];
  const upTo = eventsUpTo(events, draft.eventId);
  if (!upTo) return { ok: false, reason: 'event-missing' };
  const event = upTo[upTo.length - 1];

  const kind = goalKindOf(event);
  if (!kind) return { ok: false, reason: 'not-a-goal' };
  if (kind !== draft.facts.kind) return { ok: false, reason: 'kind-changed' };
  if ((event.player_name ?? '').trim() !== draft.facts.playerName) return { ok: false, reason: 'player-changed' };
  if (event.minute !== draft.facts.minute || (event.extra_minute ?? null) !== draft.facts.extraMinute) {
    return { ok: false, reason: 'minute-changed' };
  }

  const sorted = sortEvents(events);
  const goalIdx = sorted.findIndex((e) => e.id === event.id);
  const varAfter = sorted.some(
    (e, i) =>
      i > goalIdx &&
      e.type_id === EVENT_TYPE_VAR &&
      e.participant_id === event.participant_id &&
      e.minute - event.minute <= VAR_WINDOW_MINUTES,
  );
  if (varAfter) return { ok: false, reason: 'var-after-goal' };

  if (draft.facts.score) {
    const home = fixture.participants?.find((p) => p.meta?.location === 'home');
    const away = fixture.participants?.find((p) => p.meta?.location === 'away');
    if (!home || !away) return { ok: false, reason: 'no-participants' };
    const s = scoreAtEvent(upTo, home.id, away.id);
    if (!s.reliable || s.home !== draft.facts.score.home || s.away !== draft.facts.score.away) {
      return { ok: false, reason: 'score-changed' };
    }
  }

  return { ok: true, scorerTeamId: kind === 'own-goal' ? null : event.participant_id };
}
