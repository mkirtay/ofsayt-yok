import { describe, expect, it } from 'vitest';
import { maxLevelTotal, parseShare, parseShareScore, shareImagePath, sharePath } from './share';

describe('frikik paylaşım skoru', () => {
  it("yalnız olası skorlar: 0–1250, 50'nin katı", () => {
    expect(parseShareScore('850')).toBe(850);
    expect(parseShareScore('0')).toBe(0);
    expect(parseShareScore('1250')).toBe(1250);
    expect(parseShareScore(['300', '900'])).toBe(300);
    for (const bad of [undefined, '', '1300', '825', '-50', '85O', '1e3', ' 850', '99999', 850]) expect(parseShareScore(bad), String(bad)).toBeNull();
  });

  it('seviye modu: l 1–999, s 25\'in katı ve seviyenin üst sınırını aşmaz', () => {
    expect(maxLevelTotal(1)).toBe(250);
    expect(maxLevelTotal(2)).toBe(250 + 375);
    expect(parseShare({ s: '850' })).toEqual({ score: 850, level: null });
    expect(parseShare({ l: '7', s: '1250' })).toEqual({ score: 1250, level: 7 });
    expect(parseShare({ l: '1', s: '0' })).toEqual({ score: 0, level: 1 });
    expect(parseShare({ l: '2', s: '625' })).toEqual({ score: 625, level: 2 });
    for (const bad of [{ l: '0', s: '100' }, { l: '1000', s: '100' }, { l: '2', s: '650' }, { l: '3', s: '110' }, { l: 'x', s: '100' }, { l: '3' }, { s: '825' }, {}]) {
      expect(parseShare(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('bağlantılar', () => {
    expect(sharePath(850)).toBe('/frikik?s=850');
    expect(sharePath(1250, 7)).toBe('/frikik?l=7&s=1250');
    expect(shareImagePath({ score: 850, level: null })).toBe('/api/og/frikik?s=850');
    expect(shareImagePath({ score: 1250, level: 7 })).toBe('/api/og/frikik?l=7&s=1250');
    expect(shareImagePath(null)).toBe('/api/og/frikik');
  });
});
