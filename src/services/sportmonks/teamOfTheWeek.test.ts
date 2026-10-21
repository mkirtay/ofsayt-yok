import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/teamOfTheWeek600.json';
import {
  buildTotwRows,
  formatTotwDateRange,
  mapTeamOfTheWeek,
  parseFormation,
  type RawTotwRow,
} from './teamOfTheWeek';

const rows = fixture.data as RawTotwRow[];
// Süper Lig 7. hafta 9–12 Ekim 2026; 9 gün sonra.
const NOW = Date.parse('2026-10-21T12:00:00Z');

describe('parseFormation', () => {
  it('geçerli dizilişler', () => {
    expect(parseFormation('4-4-2')).toEqual([4, 4, 2]);
    expect(parseFormation('4-2-3-1')).toEqual([4, 2, 3, 1]);
  });
  it('toplam 10 değil / bozuk → null', () => {
    expect(parseFormation('4-4-3')).toBeNull();
    expect(parseFormation('442')).toBeNull();
    expect(parseFormation(null)).toBeNull();
  });
});

describe('mapTeamOfTheWeek (Süper Lig gerçek yanıtı)', () => {
  const totw = mapTeamOfTheWeek(600, rows, NOW)!;

  it('11 oyuncu, diziliş, tur bilgisi', () => {
    expect(totw.formation).toBe('4-4-2');
    expect(totw.players).toHaveLength(11);
    expect(totw.players.map((p) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(totw.round).toMatchObject({ id: 410384, name: '7', seasonId: 28203, startingAt: '2026-10-09', endingAt: '2026-10-12' });
    expect(totw.players[0]).toMatchObject({
      name: 'Andreas Gianniotis',
      shortName: 'A. Gianniotis',
      teamName: 'Kasımpaşa',
      teamShortCode: 'KAS',
      rating: 8.27,
    });
  });

  it('kaleci en altta; hat içinde takımın solu ekranın solunda (Sportmonks sağdan sola)', () => {
    const r = buildTotwRows(totw);
    expect(r.map((row) => row.length)).toEqual([2, 4, 4, 1]);
    expect(r[3]![0]!.position).toBe(1);
    // savunma: 2 sağ bek … 5 sol bek → ekranda 5,4,3,2
    expect(r[2]!.map((p) => p.position)).toEqual([5, 4, 3, 2]);
    expect(r[0]!.map((p) => p.position)).toEqual([11, 10]);
  });

  it('tur bitişi 21 günden eskiyse null (latest bazı liglerde haftalarca geride)', () => {
    expect(mapTeamOfTheWeek(600, rows, Date.parse('2026-11-02T23:00:00Z'))).not.toBeNull();
    expect(mapTeamOfTheWeek(600, rows, Date.parse('2026-11-03T01:00:00Z'))).toBeNull();
    expect(mapTeamOfTheWeek(600, rows, Date.parse('2026-11-03T01:00:00Z'), 30)).not.toBeNull();
  });

  it('eksik / bozuk veri → null (yarım saha çizilmez)', () => {
    expect(mapTeamOfTheWeek(600, [], NOW)).toBeNull();
    expect(mapTeamOfTheWeek(600, undefined, NOW)).toBeNull();
    expect(mapTeamOfTheWeek(600, rows.slice(0, 10), NOW)).toBeNull();
    const dup = rows.map((r, i) => (i === 1 ? { ...r, formation_position: 1 } : r));
    expect(mapTeamOfTheWeek(600, dup, NOW)).toBeNull();
    const badFormation = rows.map((r) => ({ ...r, formation: '4-4-3' }));
    expect(mapTeamOfTheWeek(600, badFormation, NOW)).toBeNull();
    const noName = rows.map((r, i) => (i === 3 ? { ...r, player: null } : r));
    expect(mapTeamOfTheWeek(600, noName, NOW)).toBeNull();
  });

  it('placeholder foto atılır', () => {
    const ph = rows.map((r, i) => (i === 0 ? { ...r, player: { ...r.player, image_path: 'https://cdn.sportmonks.com/images/soccer/placeholder.png' } } : r));
    expect(mapTeamOfTheWeek(600, ph, NOW)!.players[0]!.photo).toBeNull();
  });
});

describe('formatTotwDateRange', () => {
  it('aynı ay / farklı ay / tek gün', () => {
    expect(formatTotwDateRange('2026-10-09', '2026-10-12', 'tr')).toBe('9–12 Eki');
    expect(formatTotwDateRange('2026-09-28', '2026-10-01', 'en')).toBe('28 Sep – 1 Oct');
    expect(formatTotwDateRange('2026-10-13', null, 'tr')).toBe('13 Eki');
    expect(formatTotwDateRange(null, null, 'tr')).toBeNull();
  });
});
