import { describe, expect, it } from 'vitest';
import { mapSportmonksFixtureToMatch } from '../sportmonksFixtureMapper';
import { countRedCards, isCountedRedCard, RED_CARD_EVENTS_FILTER, RED_CARD_EVENTS_INCLUDE } from './redCards';
import type { SportmonksEventRow, SportmonksFixture } from './types';

const HOME = 8; // Liverpool
const AWAY = 9; // Manchester City
const ev = (over: Partial<SportmonksEventRow>): SportmonksEventRow =>
  ({ id: 1, fixture_id: 19722146, participant_id: HOME, type_id: 20, player_id: 5270462, minute: 62, ...over }) as SportmonksEventRow;

describe('kırmızı kart sayımı', () => {
  it('20 (kırmızı) ve 21 (ikinci sarıdan kırmızı) sayılır, takım başına', () => {
    expect(countRedCards([ev({ type_id: 21 }), ev({ type_id: 20, participant_id: AWAY }), ev({ type_id: 20 })], HOME, AWAY)).toEqual({ home: 2, away: 1 });
  });

  it('sarı kart, gol vb. sayılmaz; tanınmayan takım yok sayılır', () => {
    expect(countRedCards([ev({ type_id: 19 }), ev({ type_id: 14 }), ev({ participant_id: 999 })], HOME, AWAY)).toEqual({ home: 0, away: 0 });
  });

  it('VAR ile geri alınan (rescinded) ve teknik direktör kartı sayılmaz; yedekten atılan oyuncu sayılır', () => {
    expect(isCountedRedCard(ev({ rescinded: true }))).toBe(false);
    expect(isCountedRedCard(ev({ coach_id: 456, player_id: undefined }))).toBe(false);
    expect(isCountedRedCard(ev({ on_bench: true }))).toBe(true);
    expect(isCountedRedCard(ev({ rescinded: false, coach_id: null }))).toBe(true);
  });

  it('olaylar istenmediyse ya da takım id yoksa undefined (bilinmiyor)', () => {
    expect(countRedCards(undefined, HOME, AWAY)).toBeUndefined();
    expect(countRedCards([ev({})], undefined, AWAY)).toBeUndefined();
    expect(countRedCards([], HOME, AWAY)).toEqual({ home: 0, away: 0 });
  });

  it('istek parametreleri: yalnız 20/21, alan seçimli (canlıda 2026-10-11 doğrulandı)', () => {
    expect(RED_CARD_EVENTS_FILTER).toBe('eventTypes:20,21');
    expect(RED_CARD_EVENTS_INCLUDE).toMatch(/^events:[a-z_,]+$/);
    for (const f of ['type_id', 'participant_id', 'minute', 'rescinded', 'coach_id', 'player_id']) expect(RED_CARD_EVENTS_INCLUDE).toContain(f);
  });
});

describe('mapper → Match.red_cards', () => {
  const fixture = (events?: SportmonksEventRow[]) =>
    ({
      id: 19722146,
      state_id: 22,
      participants: [
        { id: HOME, name: 'Liverpool', meta: { location: 'home' } },
        { id: AWAY, name: 'Manchester City', meta: { location: 'away' } },
      ],
      ...(events ? { events } : {}),
    }) as unknown as SportmonksFixture;

  it('kart varsa alan dolu (gerçek örnek: Liverpool 62\' ikinci sarı)', () => {
    expect(mapSportmonksFixtureToMatch(fixture([ev({ type_id: 21, sub_type_id: 1496 })])).red_cards).toEqual({ home: 1, away: 0 });
  });

  it('kart yoksa ya da olaylar gelmediyse alan yok (ISR props şişmesin)', () => {
    expect('red_cards' in mapSportmonksFixtureToMatch(fixture([]))).toBe(false);
    expect('red_cards' in mapSportmonksFixtureToMatch(fixture())).toBe(false);
    expect('red_cards' in mapSportmonksFixtureToMatch(fixture([ev({ rescinded: true })]))).toBe(false);
  });
});
