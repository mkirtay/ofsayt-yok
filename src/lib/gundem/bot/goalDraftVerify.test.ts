import { describe, expect, it } from 'vitest';
import type { SportmonksEventRow, SportmonksFixture } from '@/services/sportmonks/types';
import { verifyGoalStillValid } from './goalDraftVerify';
import type { GoalFacts } from './goalTemplates';

const HOME = 10;
const AWAY = 20;
let seq = 1000;
const ev = (o: Partial<SportmonksEventRow> & { type_id: number; minute: number }): SportmonksEventRow => {
  seq += 1;
  return { id: seq, fixture_id: 1, participant_id: HOME, player_id: 7, player_name: 'Icardi', ...o };
};
const fixture = (events: SportmonksEventRow[]): SportmonksFixture => ({
  id: 1,
  participants: [
    { id: HOME, name: 'Galatasaray', meta: { location: 'home', winner: null } },
    { id: AWAY, name: 'Fenerbahçe', meta: { location: 'away', winner: null } },
  ],
  events,
});
const facts = (o: Partial<GoalFacts> = {}): GoalFacts => ({
  kind: 'goal', playerName: 'Icardi', teamName: 'Galatasaray', minute: 30, extraMinute: null,
  homeName: 'Galatasaray', awayName: 'Fenerbahçe', score: { home: 1, away: 0 }, leagueName: 'Süper Lig', milestone: null, ...o,
});

describe('verifyGoalStillValid', () => {
  const goal = ev({ type_id: 14, minute: 30 });

  it('değişmemiş gol geçerli; golcü takım id döner', () => {
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts() }, fixture([goal]))).toEqual({ ok: true, scorerTeamId: HOME });
  });

  it('olay listeden kalktıysa (VAR iptali) event-missing', () => {
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts() }, fixture([]))).toEqual({ ok: false, reason: 'event-missing' });
  });

  it('olay artık gol değilse / türü değiştiyse', () => {
    const card = { ...goal, type_id: 19 };
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts() }, fixture([card]))).toEqual({ ok: false, reason: 'not-a-goal' });
    const pen = { ...goal, type_id: 16 };
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts() }, fixture([pen]))).toEqual({ ok: false, reason: 'kind-changed' });
  });

  it('oyuncu ya da dakika değiştiyse', () => {
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts({ playerName: 'Başka' }) }, fixture([goal]))).toEqual({ ok: false, reason: 'player-changed' });
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts({ minute: 31 }) }, fixture([goal]))).toEqual({ ok: false, reason: 'minute-changed' });
  });

  it('golden hemen sonra aynı takım için VAR olayı → var-after-goal; rakip/uzak VAR etkilemez', () => {
    const varSame = ev({ type_id: 10, minute: 31, participant_id: HOME });
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts() }, fixture([goal, varSame]))).toEqual({ ok: false, reason: 'var-after-goal' });
    const varOther = ev({ type_id: 10, minute: 31, participant_id: AWAY });
    const varFar = ev({ type_id: 10, minute: 80, participant_id: HOME });
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts() }, fixture([goal, varOther, varFar])).ok).toBe(true);
  });

  it('daha önceki bir gol iptal olup skor değiştiyse score-changed', () => {
    const early = ev({ type_id: 14, minute: 10, participant_id: AWAY, player_id: 9 });
    // taslak 1-0 diyordu; şimdi 30'daki gol 1-1 → skor değişti
    expect(verifyGoalStillValid({ eventId: goal.id, facts: facts() }, fixture([early, goal]))).toEqual({ ok: false, reason: 'score-changed' });
  });

  it('skor satırı olmayan taslakta (kendi kalesine) skor karşılaştırılmaz', () => {
    const own = ev({ type_id: 15, minute: 30 });
    const r = verifyGoalStillValid({ eventId: own.id, facts: facts({ kind: 'own-goal', score: null, teamName: null }) }, fixture([own]));
    expect(r).toEqual({ ok: true, scorerTeamId: null });
  });
});
