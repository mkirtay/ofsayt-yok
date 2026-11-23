import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { insertSlotsAfterGroups, type FlatItem } from './index';

/** n grup, her grupta k maç. */
function groups(n: number, k = 2): FlatItem[] {
  const out: FlatItem[] = [];
  for (let g = 0; g < n; g++) {
    out.push({ type: 'header', showGap: g > 0 } as FlatItem);
    for (let i = 0; i < k; i++) out.push({ type: 'match', match: { id: g * 10 + i } as unknown as Match, isFirstInGroup: i === 0, isLastInGroup: i === k - 1 });
  }
  return out;
}
const shape = (items: FlatItem[]) => items.map((i) => (i.type === 'slot' ? `S${i.index}` : i.type === 'header' ? 'H' : 'm')).join('');

describe('insertSlotsAfterGroups', () => {
  it('ilk slot min maçtan sonraki grup sonunda, sonrakiler her 3 grupta bir', () => {
    expect(shape(insertSlotsAfterGroups(groups(8), 3, 1, 3))).toBe('HmmS0HmmHmmHmmS1HmmHmmHmmS2Hmm');
  });
  it('min maç: 6 maç dolmadan ilk slot girmez', () => {
    expect(shape(insertSlotsAfterGroups(groups(5), 1, 6, 3))).toBe('HmmHmmHmmS0HmmHmm');
  });
  it('liste kısaysa kalan slotlar son grubun ardına art arda', () => {
    expect(shape(insertSlotsAfterGroups(groups(2), 3, 1, 3))).toBe('HmmS0HmmS1S2');
  });
  it('slottan sonraki başlığın üst boşluğu kalkar', () => {
    const out = insertSlotsAfterGroups(groups(3), 1, 1, 3);
    const h = out[out.findIndex((i) => i.type === 'slot') + 1] as { showGap: boolean };
    expect(h.showGap).toBe(false);
  });
});
