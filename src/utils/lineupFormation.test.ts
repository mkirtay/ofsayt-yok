import { describe, it, expect } from 'vitest';
import { buildFormationLayout } from './lineupFormation';
import { mapSportmonksLineups, parseFormationField } from '@/services/sportmonksKatman2Mapper';
import type { SportmonksFixture, SportmonksLineupRow } from '@/services/sportmonks/types';
import fixture from '@/services/sportmonks/__fixtures__/lineupFormationSuperLig.json';

/**
 * Gerçek fixture 19746621 (Fenerbahçe vs Beşiktaş, 2026-09-18 tazelenmiş istek): ilk 11'lerin
 * `formation_field` ızgarası Fenerbahçe için 1-4-2-3-1, Beşiktaş için 1-4-1-4-1;
 * `position_id` ise ikisi için de kaba 4-5-1 (DM/AM/kanat hepsi "MF").
 */
const base = fixture as unknown as { participants: SportmonksFixture['participants']; lineups: SportmonksLineupRow[] };
const map = (lineups: SportmonksLineupRow[]) =>
  mapSportmonksLineups({ id: 1, participants: base.participants, lineups })!;

describe('parseFormationField', () => {
  it('"2:3" → satır/sütun, boş/bozuk → null', () => {
    expect(parseFormationField('2:3')).toEqual({ row: 2, col: 3 });
    expect(parseFormationField(null)).toBeNull();
    expect(parseFormationField('x')).toBeNull();
  });
});

describe('buildFormationLayout — formation_field ızgarası', () => {
  const data = map(base.lineups);
  it('Fenerbahçe (home) 4-2-3-1: kaleci en arkada, hatlar artan satır sırasıyla', () => {
    const layout = buildFormationLayout(data.lineup.home.players);
    expect(layout.source).toBe('grid');
    expect(layout.label).toBe('4-2-3-1');
    expect(layout.rows.map((r) => r.length)).toEqual([1, 4, 2, 3, 1]);
    expect(layout.rows[0][0].position).toBe('GK');
    expect(layout.rows[4][0].position).toBe('FW');
  });
  it('Beşiktaş (away) 4-1-4-1 ve satır içi sütun sırası korunur', () => {
    const layout = buildFormationLayout(data.lineup.away.players);
    expect(layout.label).toBe('4-1-4-1');
    for (const row of layout.rows) {
      const cols = row.map((p) => p.formation_col!);
      expect(cols).toEqual([...cols].sort((a, b) => a - b));
    }
  });
  it('11 oyuncunun hepsi bir satıra yerleşir (kaybolan yok)', () => {
    for (const side of [data.lineup.home, data.lineup.away]) {
      expect(buildFormationLayout(side.players).rows.flat()).toHaveLength(11);
    }
  });
});

describe('buildFormationLayout — formation_field yoksa position_id fallback\'i', () => {
  const noGrid = base.lineups.map((l) => ({ ...l, formation_field: null }));
  const data = map(noGrid);
  it('GK/DF/MF/FW hatlarına ayrılır (kaba 4-5-1)', () => {
    const layout = buildFormationLayout(data.lineup.home.players);
    expect(layout.source).toBe('position');
    expect(layout.rows.map((r) => r.length)).toEqual([1, 4, 5, 1]);
    expect(layout.label).toBe('4-5-1');
  });
  it('bir oyuncuda bile ızgara eksikse karışık yerleşim yerine tamamen position\'a düşer', () => {
    const partial = base.lineups.map((l, i) => (i === 0 ? { ...l, formation_field: null } : l));
    const d = map(partial);
    const team = d.lineup.home.players.some((p) => p.formation_row == null) ? d.lineup.home : d.lineup.away;
    expect(buildFormationLayout(team.players).source).toBe('position');
  });
  it('pozisyonu da null olan oyuncu kaybolmaz, orta sahaya (MF) konur', () => {
    const homeId = base.participants!.find((p) => p.meta?.location === 'home')!.id;
    const target = noGrid.find((l) => l.team_id === homeId && l.position_id === 25)!; // bir defans oyuncusu
    const d = map(noGrid.map((l) => (l === target ? { ...l, position_id: null as unknown as number } : l)));
    const layout = buildFormationLayout(d.lineup.home.players);
    expect(layout.rows.flat()).toHaveLength(11);
    const row = layout.rows.find((r) => r.some((p) => p.id === String(target.player_id)))!;
    expect(row.some((p) => p.position === 'MF')).toBe(true); // MF hattına eklendi
    expect(layout.rows.map((r) => r.length)).toEqual([1, 3, 6, 1]); // 4 DF → 3 DF + 1 bilinmeyen MF hattında
  });
});
