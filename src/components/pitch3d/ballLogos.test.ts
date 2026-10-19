import { describe, expect, it } from 'vitest';
import { pickLogoIds } from './ballLogos';

describe('pickLogoIds', () => {
  it('sabitlenen önce (havuzda yoksa atlanır), tekrar yok, havuz yetmezse olduğu kadar', () => {
    let seed = 0.37;
    const rand = () => (seed = ((seed * 9301 + 49297) % 233280) / 233280);
    const ids = pickLogoIds([1, 2, 3, 4, 5, 600], 4, [600, 999], rand);
    expect(ids[0]).toBe(600);
    expect(ids).not.toContain(999);
    expect(new Set(ids).size).toBe(4);
    expect(pickLogoIds([1, 2], 5, [], rand).sort()).toEqual([1, 2]);
    expect(pickLogoIds([1, 2], -1, [1], rand)).toEqual([]);
  });
});
