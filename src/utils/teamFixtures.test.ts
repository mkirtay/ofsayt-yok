import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import {
  buildTeamFixtureGroups,
  fixtureKickoffLabel,
  nextFixtureWhen,
  nextTeamFixture,
  teamOpponent,
} from './teamFixtures';

function m(id: number, date: string, scheduled: string, homeId = 34, awayId = 99): Match {
  return {
    id,
    status: 'NOT STARTED',
    time: '',
    date,
    scheduled,
    home: { id: homeId, name: `T${homeId}` },
    away: { id: awayId, name: `T${awayId}` },
  };
}

describe('teamOpponent', () => {
  it('iç saha / deplasman rakibini döndürür', () => {
    expect(teamOpponent(m(1, '2026-10-09', '17:00', 34, 7), '34')).toEqual({ opponent: { id: 7, name: 'T7' }, isHome: true });
    expect(teamOpponent(m(1, '2026-10-09', '17:00', 7, 34), '34')).toEqual({ opponent: { id: 7, name: 'T7' }, isHome: false });
  });

  it('takım maçta yoksa null', () => {
    expect(teamOpponent(m(1, '2026-10-09', '17:00', 7, 8), '34')).toBeNull();
  });
});

describe('buildTeamFixtureGroups / nextTeamFixture', () => {
  const today = '2026-09-24';

  it('TR gününe göre gruplar; 21:30 UTC maç ertesi TR gününe düşer', () => {
    const groups = buildTeamFixtureGroups([m(2, '2026-10-13', '21:30'), m(1, '2026-10-09', '17:00')], today);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-09', '2026-10-14']);
    expect(nextTeamFixture(groups)?.id).toBe(1);
  });

  it('geçmiş güne düşen maçlar elenir, geçmişe geri dönülmez', () => {
    const groups = buildTeamFixtureGroups([m(1, '2026-09-20', '17:00')], today);
    expect(groups).toEqual([]);
    expect(nextTeamFixture(groups)).toBeNull();
  });
});

describe('fixtureKickoffLabel / nextFixtureWhen', () => {
  const labels = { today: 'Bugün', tomorrow: 'Yarın' };

  it('saat TR\'ye çevrilir; açıklanmamışsa yer tutucu', () => {
    expect(fixtureKickoffLabel(m(1, '2026-10-09', '17:00'), 'Belirsiz')).toBe('20:00');
    expect(fixtureKickoffLabel({ ...m(1, '2027-02-07', '00:00'), time_tbd: true }, 'Belirsiz')).toBe('Belirsiz');
  });

  it('bugün / yarın / tarih + saat; saat yoksa yalnızca gün', () => {
    expect(nextFixtureWhen(m(1, '2026-09-24', '17:00'), '2026-09-24', 'tr', labels)).toBe('Bugün 20:00');
    // 21:30 UTC = ertesi gün 00:30 TR
    expect(nextFixtureWhen(m(1, '2026-09-24', '21:30'), '2026-09-24', 'tr', labels)).toBe('Yarın 00:30');
    expect(nextFixtureWhen(m(1, '2026-10-13', '19:00'), '2026-09-24', 'tr', labels)).toBe('13 Ekim Salı 22:00');
    expect(nextFixtureWhen(m(1, '2026-10-13', '19:00'), '2026-09-24', 'en', labels)).toMatch(/^Tuesday 13 October 22:00$|^13 October Tuesday 22:00$/);
    expect(nextFixtureWhen({ ...m(1, '2027-02-07', '00:00'), time_tbd: true }, '2026-09-24', 'tr', labels)).toBe('7 Şubat Pazar');
  });
});
