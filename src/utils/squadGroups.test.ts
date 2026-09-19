import { describe, it, expect } from 'vitest';
import { groupSquadByPosition } from './squadGroups';

describe('groupSquadByPosition', () => {
  it('Forvet→Orta Saha→Defans→Kaleci sırasında, formaya göre artan gruplar', () => {
    const g = groupSquadByPosition([
      { name: 'a', position: 'FW', shirt_number: 9 },
      { name: 'b', position: 'GK', shirt_number: 25 },
      { name: 'c', position: 'DF', shirt_number: 4 },
      { name: 'd', position: 'GK', shirt_number: 1 },
      { name: 'e', position: 'DF', shirt_number: 2 },
    ]);
    expect(g.map((x) => x.label)).toEqual(['Forvet', 'Defans', 'Kaleci']);
    expect(g[1].players.map((p) => p.name)).toEqual(['e', 'c']);
    expect(g[2].players.map((p) => p.name)).toEqual(['d', 'b']);
  });

  it('pozisyonsuz/bilinmeyen oyuncu Orta Saha grubuna düşer; numarasız en sona', () => {
    const g = groupSquadByPosition([
      { name: 'x', shirt_number: null },
      { name: 'y', position: 'ZZ', shirt_number: 8 },
      { name: 'z', position: 'MF', shirt_number: 10 },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe('MF');
    expect(g[0].players.map((p) => p.name)).toEqual(['y', 'z', 'x']);
  });

  it('boş kadro boş liste döner', () => {
    expect(groupSquadByPosition([])).toEqual([]);
  });
});
