import { describe, expect, it } from 'vitest';
import { resolveHubSidePanel } from './hubSidePanel';

describe('resolveHubSidePanel', () => {
  it('seçim varken her zaman detay (Gündem değil), split açıksa', () => {
    expect(resolveHubSidePanel({ isSplit: true, hasSelection: true, gundemPanelWide: false })).toBe('detail');
    expect(resolveHubSidePanel({ isSplit: true, hasSelection: true, gundemPanelWide: true })).toBe('detail');
  });
  it('seçim yok + ≥1440 → idle Gündem', () => {
    expect(resolveHubSidePanel({ isSplit: true, hasSelection: false, gundemPanelWide: true })).toBe('gundem');
  });
  it('seçim yok + 1200–1439 → panel yok (mevcut davranış)', () => {
    expect(resolveHubSidePanel({ isSplit: true, hasSelection: false, gundemPanelWide: false })).toBe('none');
  });
  it('split kapalıyken (mobil/masaüstü dar) hiçbir panel yok — seçim olsa bile', () => {
    expect(resolveHubSidePanel({ isSplit: false, hasSelection: true, gundemPanelWide: false })).toBe('none');
    expect(resolveHubSidePanel({ isSplit: false, hasSelection: false, gundemPanelWide: true })).toBe('none');
  });
  it("Gündem yalnızca seçim yokken; detay yalnızca seçim varken (tüm kombinasyonlar)", () => {
    for (const isSplit of [true, false])
      for (const hasSelection of [true, false])
        for (const gundemPanelWide of [true, false]) {
          const r = resolveHubSidePanel({ isSplit, hasSelection, gundemPanelWide });
          if (r === 'gundem') expect(!hasSelection && isSplit && gundemPanelWide).toBe(true);
          if (r === 'detail') expect(hasSelection && isSplit).toBe(true);
        }
  });
});
