import { describe, expect, it } from 'vitest';
import type { SportmonksFixture } from './types';
import { defaultCompetitionId, mapTeamOverview, teamForm, teamMatchResult, type TeamMatch } from './teamOverview';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const SL = { id: 600, name: 'Super Lig', image_path: '600.png', sub_type: 'domestic' };
const UCL = { id: 2, name: 'Champions League', image_path: '2.png', sub_type: 'cup_international' };

function fx(
  id: number,
  startingAt: string,
  stateId: number,
  goals?: [number, number],
  extra: Partial<SportmonksFixture> = {},
): SportmonksFixture {
  return {
    id,
    starting_at: startingAt,
    state_id: stateId,
    league: SL,
    has_odds: true,
    participants: [
      { id: 34, name: 'Galatasaray', image_path: 'gs.png', meta: { location: 'home' } },
      { id: 100 + id, name: `Rakip ${id}`, meta: { location: 'away' } },
    ],
    ...(goals
      ? {
          scores: [
            { description: 'CURRENT', score: { goals: goals[0], participant: 'home' } },
            { description: 'CURRENT', score: { goals: goals[1], participant: 'away' } },
          ],
        }
      : {}),
    ...extra,
  } as SportmonksFixture;
}

describe('mapTeamOverview', () => {
  it('latest + upcoming birleşir; son maçlar en yeniden, fikstür en yakından', () => {
    const out = mapTeamOverview(
      {
        id: 34,
        name: 'Galatasaray',
        image_path: 'gs.png',
        latest: [fx(1, '2026-09-13 17:00:00', 5, [1, 0]), fx(2, '2026-09-19 17:00:00', 5, [0, 4])],
        upcoming: [fx(4, '2026-10-13 19:00:00', 1, undefined, { league: UCL }), fx(3, '2026-10-09 17:00:00', 1)],
      },
      NOW,
    );
    expect(out.team).toEqual({ id: 34, name: 'Galatasaray', logo: 'gs.png' });
    expect(out.recent.map((m) => m.id)).toEqual([2, 1]);
    expect(out.fixtures.map((m) => m.id)).toEqual([3, 4]);
    expect(out.recent[0]!.competition).toMatchObject({ id: 600, name: 'Super Lig', logo: '600.png' });
  });

  it('canlı maç iki listede de gelirse tekilleşir ve son maçların başında durur', () => {
    const live = fx(9, '2026-10-02 11:30:00', 2, [1, 0]);
    const liveAsNs = fx(9, '2026-10-02 11:30:00', 1);
    const out = mapTeamOverview(
      { id: 34, latest: [live, fx(1, '2026-09-19 17:00:00', 5, [2, 2])], upcoming: [liveAsNs, fx(3, '2026-10-09 17:00:00', 1)] },
      NOW,
    );
    expect(out.recent.map((m) => m.id)).toEqual([9, 1]);
    expect(out.recent[0]!.status).toBe('IN PLAY');
    expect(out.fixtures.map((m) => m.id)).toEqual([3]);
  });

  it('canlı maç yalnız upcoming\'de gelse de son maçlara geçer', () => {
    const out = mapTeamOverview({ id: 34, latest: [], upcoming: [fx(9, '2026-10-02 11:30:00', 3, [0, 0])] }, NOW);
    expect(out.recent.map((m) => m.id)).toEqual([9]);
    expect(out.fixtures).toEqual([]);
  });

  it('tarihi çoktan geçmiş ertelenmiş maç fikstürde değil son maçlarda; saati açıklanmamış maç işaretlenir', () => {
    const out = mapTeamOverview(
      {
        id: 34,
        latest: [fx(5, '2026-09-01 17:00:00', 10)],
        upcoming: [fx(6, '2027-02-07 00:00:00', 1, undefined, { has_odds: false })],
      },
      NOW,
    );
    expect(out.recent.map((m) => [m.id, m.state_code])).toEqual([[5, 'POSTPONED']]);
    expect(out.fixtures[0]).toMatchObject({ id: 6, time_tbd: true });
  });

  it('başlama saati az önce geçmiş ama hâlâ NS görünen maç fikstürde kalır', () => {
    const out = mapTeamOverview({ id: 34, upcoming: [fx(7, '2026-10-02 11:00:00', 1)] }, NOW);
    expect(out.fixtures.map((m) => m.id)).toEqual([7]);
  });

  it('takım yoksa boş', () => {
    expect(mapTeamOverview(null, NOW)).toEqual({ team: null, recent: [], fixtures: [] });
  });
});

describe('teamMatchResult / teamForm', () => {
  const recent = (list: SportmonksFixture[]) => mapTeamOverview({ id: 34, latest: list }, NOW).recent;

  it('ev/deplasman bakış açısıyla G/B/M', () => {
    const [win, loss] = recent([fx(1, '2026-09-13 17:00:00', 5, [3, 1]), fx(2, '2026-09-06 17:00:00', 5, [0, 2])]);
    expect(teamMatchResult(win!, '34')).toBe('W');
    expect(teamMatchResult(loss!, '34')).toBe('L');
    expect(teamMatchResult(win!, '101')).toBe('L');
  });

  it('penaltıyla biten maç B; uzatmada kazanılan maç G (CURRENT skor)', () => {
    const [pens, aet] = recent([
      fx(1, '2026-09-13 17:00:00', 8, [1, 1]),
      fx(2, '2026-09-06 17:00:00', 7, [2, 1], {
        scores: [
          { description: '2ND_HALF', score: { goals: 1, participant: 'home' } },
          { description: '2ND_HALF', score: { goals: 1, participant: 'away' } },
          { description: 'CURRENT', score: { goals: 2, participant: 'home' } },
          { description: 'CURRENT', score: { goals: 1, participant: 'away' } },
        ],
      } as Partial<SportmonksFixture>),
    ]);
    expect(teamMatchResult(pens!, '34')).toBe('D');
    expect(teamMatchResult(aet!, '34')).toBe('W');
  });

  it('form: canlı, ertelenmiş ve iptal maçlar atlanır; en yeni başta, en fazla 5', () => {
    const list = recent([
      fx(10, '2026-10-02 11:30:00', 2, [1, 0]), // canlı
      fx(9, '2026-09-30 17:00:00', 12), // iptal
      fx(8, '2026-09-28 17:00:00', 5, [1, 0]),
      fx(7, '2026-09-24 17:00:00', 5, [1, 1]),
      fx(6, '2026-09-20 17:00:00', 5, [0, 1]),
      fx(5, '2026-09-16 17:00:00', 5, [2, 0]),
      fx(4, '2026-09-12 17:00:00', 5, [2, 2]),
      fx(3, '2026-09-08 17:00:00', 5, [5, 0]),
    ]);
    expect(teamForm(list, '34').map((f) => `${f.match.id}${f.result}`)).toEqual(['8W', '7D', '6L', '5W', '4D']);
  });
});

describe('defaultCompetitionId', () => {
  const m = (id: number, comp: number) => ({ id, competition: { id: comp, name: '' } }) as TeamMatch;

  it('son 10 maçta en çok oynanan turnuva (en son maç ŞL olsa da lig)', () => {
    expect(defaultCompetitionId([m(1, 2), m(2, 600), m(3, 600), m(4, 2), m(5, 600)])).toBe(600);
  });

  it('eşitlikte en yeni maçı olan; yalnız son 10 maç sayılır', () => {
    expect(defaultCompetitionId([m(1, 2), m(2, 600), m(3, 600), m(4, 2)])).toBe(2);
    const many = [...Array.from({ length: 6 }, (_, i) => m(i, 2)), ...Array.from({ length: 4 }, (_, i) => m(10 + i, 600))];
    expect(defaultCompetitionId([...many, ...Array.from({ length: 10 }, (_, i) => m(20 + i, 600))])).toBe(2);
  });

  it('son maç yoksa fikstürün ilk turnuvası; hiçbiri yoksa null', () => {
    expect(defaultCompetitionId([], [m(1, 606)])).toBe(606);
    expect(defaultCompetitionId([], [])).toBeNull();
  });
});
