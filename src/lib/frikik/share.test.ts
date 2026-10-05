import { describe, expect, it } from 'vitest';
import { parseShareScore, shareImagePath, sharePath } from './share';

describe('frikik paylaşım skoru', () => {
  it('yalnız olası skorlar: 0–1250, 50\'nin katı', () => {
    expect(parseShareScore('850')).toBe(850);
    expect(parseShareScore('0')).toBe(0);
    expect(parseShareScore('1250')).toBe(1250);
    expect(parseShareScore(['300', '900'])).toBe(300);
    for (const bad of [undefined, '', '1300', '825', '-50', '85O', '1e3', ' 850', '99999', 850]) expect(parseShareScore(bad), String(bad)).toBeNull();
  });

  it('bağlantılar', () => {
    expect(sharePath(850)).toBe('/frikik?s=850');
    expect(shareImagePath(850)).toBe('/api/og/frikik?s=850');
    expect(shareImagePath(null)).toBe('/api/og/frikik');
  });
});
