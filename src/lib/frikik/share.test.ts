import { describe, expect, it } from 'vitest';
import { maxLevelTotal, parseShare, shareImagePath, sharePath } from './share';

describe('frikik paylaşım bağlantısı', () => {
  it("seviye koşusu: l 1–999, s 25'in katı ve seviyenin üst sınırını aşmaz; eski ?s= (5 vuruş) yok sayılır", () => {
    expect(maxLevelTotal(1)).toBe(250);
    expect(maxLevelTotal(2)).toBe(250 + 375);
    expect(parseShare({ l: '7', s: '1250' })).toEqual({ score: 1250, level: 7 });
    expect(parseShare({ l: '1', s: '0' })).toEqual({ score: 0, level: 1 });
    expect(parseShare({ l: ['2', '9'], s: '625' })).toEqual({ score: 625, level: 2 });
    for (const bad of [{ s: '850' }, { l: '0', s: '100' }, { l: '1000', s: '100' }, { l: '2', s: '650' }, { l: '3', s: '110' }, { l: 'x', s: '100' }, { l: '3' }, {}]) {
      expect(parseShare(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('bağlantılar', () => {
    expect(sharePath(7, 1250)).toBe('/frikik?l=7&s=1250');
    expect(shareImagePath({ score: 1250, level: 7 })).toBe('/api/og/frikik?l=7&s=1250');
    expect(shareImagePath(null)).toBe('/api/og/frikik');
  });
});
