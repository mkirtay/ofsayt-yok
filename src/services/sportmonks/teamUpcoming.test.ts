import { describe, expect, it } from 'vitest';
import type { SportmonksFixture } from './types';
import { isKickoffTimeTbd, mapTeamUpcoming, mapTeamUpcomingFixtures } from './teamUpcoming';

const GS = { id: 34, name: 'Galatasaray', image_path: 'gs.png', meta: { location: 'home' } };
const league = (id: number, name: string) => ({ id, name, image_path: `${id}.png`, sub_type: 'domestic' });

function fx(id: number, startingAt: string, extra: Partial<SportmonksFixture> = {}): SportmonksFixture {
  return {
    id,
    starting_at: startingAt,
    state_id: 1,
    state: { id: 1, state: 'NS', name: 'Not Started', short_name: 'NS', developer_name: 'NS' },
    league: league(600, 'Super Lig'),
    participants: [GS, { id: 100 + id, name: `Rakip ${id}`, meta: { location: 'away' } }],
    has_odds: true,
    ...extra,
  } as SportmonksFixture;
}

describe('isKickoffTimeTbd', () => {
  it('00:00 UTC + oran yok → saat açıklanmamış', () => {
    expect(isKickoffTimeTbd({ starting_at: '2027-02-07 00:00:00', has_odds: false })).toBe(true);
    expect(isKickoffTimeTbd({ starting_at: '2027-02-07 00:00:00' })).toBe(true);
  });

  it('00:00 UTC ama oran açık (gerçek gece maçı) ya da başka saat → kesin', () => {
    expect(isKickoffTimeTbd({ starting_at: '2026-10-09 00:00:00', has_odds: true })).toBe(false);
    expect(isKickoffTimeTbd({ starting_at: '2027-02-07 17:00:00', has_odds: false })).toBe(false);
    expect(isKickoffTimeTbd({ starting_at: null })).toBe(false);
  });
});

describe('mapTeamUpcomingFixtures', () => {
  it('yalnızca oynanmamış maçlar; tekil; en yakından uzağa', () => {
    const live = fx(3, '2026-09-24 17:00:00', { state_id: 2, state: undefined });
    const finished = fx(4, '2026-09-20 17:00:00', { state_id: 5, state: undefined });
    const postponed = fx(5, '2026-11-01 17:00:00', { state_id: 10, state: undefined });
    const out = mapTeamUpcomingFixtures([
      fx(2, '2026-10-13 19:00:00', { league: league(2, 'Champions League') }),
      fx(1, '2026-10-09 17:00:00'),
      fx(1, '2026-10-09 17:00:00'),
      live,
      finished,
      postponed,
    ]);
    expect(out.map((m) => m.id)).toEqual([1, 2, 5]);
    expect(out[1]).toMatchObject({
      date: '2026-10-13',
      scheduled: '19:00',
      competition: { id: 2, name: 'Champions League', logo: '2.png' },
      away: { id: 102, name: 'Rakip 2' },
    });
    expect(out.every((m) => m.time_tbd === undefined)).toBe(true);
  });

  it('saati açıklanmamış maç işaretlenir', () => {
    const [m] = mapTeamUpcomingFixtures([fx(9, '2027-02-07 00:00:00', { has_odds: false })]);
    expect(m.time_tbd).toBe(true);
  });

  it('boş/eksik include → boş liste', () => {
    expect(mapTeamUpcomingFixtures(undefined)).toEqual([]);
    expect(mapTeamUpcomingFixtures(null)).toEqual([]);
  });
});

describe('mapTeamUpcoming', () => {
  it('takım adı/logosu + fikstür', () => {
    const out = mapTeamUpcoming({ id: 34, name: 'Galatasaray', image_path: 'gs.png', upcoming: [fx(1, '2026-10-09 17:00:00')] });
    expect(out.team).toEqual({ id: 34, name: 'Galatasaray', logo: 'gs.png' });
    expect(out.fixtures).toHaveLength(1);
  });

  it('veri yoksa boş', () => {
    expect(mapTeamUpcoming(null)).toEqual({ team: null, fixtures: [] });
    expect(mapTeamUpcoming({ id: 34, upcoming: null }).fixtures).toEqual([]);
  });
});
