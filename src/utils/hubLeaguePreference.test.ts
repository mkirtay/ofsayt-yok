import { describe, expect, it } from 'vitest';
import { parseStoredHubLeague } from './hubLeaguePreference';

const allowed = (id: number) => [6, 2, -636].includes(id);

describe('hatırlanan lig (localStorage)', () => {
  it('geçerli kayıt: id + satır sayısı; düz sayı da kabul', () => {
    expect(parseStoredHubLeague('{"id":2,"rows":20}', allowed)).toEqual({ id: 2, rows: 20 });
    expect(parseStoredHubLeague('{"id":-636}', allowed)).toEqual({ id: -636, rows: null });
    expect(parseStoredHubLeague('6', allowed)).toEqual({ id: 6, rows: null });
  });

  it('bozuk / bilinmeyen / izin verilmeyen değer yok sayılır; anlamsız satır sayısı atılır', () => {
    for (const raw of [null, '', 'abc', '{"id":"6"}', '{"id":999}', '{"id":0}', '{"id":2.5}', '[]', 'null']) {
      expect(parseStoredHubLeague(raw, allowed), String(raw)).toBeNull();
    }
    expect(parseStoredHubLeague('{"id":2,"rows":-3}', allowed)).toEqual({ id: 2, rows: null });
    expect(parseStoredHubLeague('{"id":2,"rows":500}', allowed)).toEqual({ id: 2, rows: null });
  });
});
