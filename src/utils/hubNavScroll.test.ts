import { describe, expect, it } from 'vitest';
import { hubSectionToScroll } from './hubNavScroll';

const base = { prevKey: '|', nextKey: 'live|', isMobile: true, fromInPageControl: false, hasPanel: false };

describe('hubSectionToScroll', () => {
  it('alt menü "Canlı" (?tab=live) mobilde listeye kaydırır; panel bağlantıları yan panele', () => {
    expect(hubSectionToScroll(base)).toBe('hub-list');
    expect(hubSectionToScroll({ ...base, nextKey: '|leagues', hasPanel: true })).toBe('hub-sidebar');
  });

  it('durum çipinden gelen değişiklik kaydırmaz (aç da kapa da)', () => {
    expect(hubSectionToScroll({ ...base, fromInPageControl: true })).toBeNull();
    expect(hubSectionToScroll({ ...base, prevKey: 'live|', nextKey: '|', fromInPageControl: true })).toBeNull();
  });

  it('ilk yükleme, değişmeyen anahtar ve masaüstü kaydırmaz', () => {
    expect(hubSectionToScroll({ ...base, prevKey: null })).toBeNull();
    expect(hubSectionToScroll({ ...base, prevKey: 'live|' })).toBeNull();
    expect(hubSectionToScroll({ ...base, isMobile: false })).toBeNull();
  });
});
