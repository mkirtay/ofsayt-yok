import { describe, expect, it } from 'vitest';
import { decideChromeHidden } from './useHideOnScroll';

describe('decideChromeHidden — kaydırma yönüne göre logo bandı', () => {
  it('sayfanın üstünde (header yüksekliği içinde) hep görünür', () => {
    expect(decideChromeHidden(true, 200, 40, 60)).toEqual({ hidden: false, anchorY: 40 });
    expect(decideChromeHidden(false, 0, 60, 60).hidden).toBe(false);
  });

  it('aşağı kaydırma gizler, yukarı kaydırma geri getirir', () => {
    expect(decideChromeHidden(false, 100, 140, 60)).toEqual({ hidden: true, anchorY: 140 });
    expect(decideChromeHidden(true, 400, 380, 60)).toEqual({ hidden: false, anchorY: 380 });
  });

  it('6 px altı titreşim durumu değiştirmez, çıpa yerinde kalır (küçük adımlar birikir)', () => {
    expect(decideChromeHidden(false, 100, 104, 60)).toEqual({ hidden: false, anchorY: 100 });
    expect(decideChromeHidden(true, 300, 297, 60)).toEqual({ hidden: true, anchorY: 300 });
    // 4 + 4 px: ikinci adımda çıpaya göre 8 px → gizlenir
    const first = decideChromeHidden(false, 100, 104, 60);
    expect(decideChromeHidden(first.hidden, first.anchorY, 108, 60).hidden).toBe(true);
  });
});
