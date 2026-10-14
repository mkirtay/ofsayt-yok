import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_FAVORITES_LS_KEY, parseLocalFavoriteIds } from './favoriteImport';
import { HUB_FAV_COUNT_BOOT_SCRIPT, HUB_FAV_COUNT_VAR, applyFavCount, favCountCssValue, toggleMatchFavorite } from './hubFavorites';

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

/** Satır içi betiği sahte localStorage / document ile çalıştırır; yazılan CSS değişkenini döner. */
function runBoot(stored: string | null): string | null {
  const props = new Map<string, string>();
  const localStorage = { getItem: (k: string) => (k === HOME_FAVORITES_LS_KEY ? stored : null) };
  const document = { documentElement: { style: { setProperty: (k: string, v: string) => void props.set(k, v) } } };
  new Function('localStorage', 'document', HUB_FAV_COUNT_BOOT_SCRIPT)(localStorage, document);
  return props.get(HUB_FAV_COUNT_VAR) ?? null;
}

describe('toggleMatchFavorite', () => {
  it('iki takım da favori değilse ev sahibi eklenir', () => {
    expect(toggleMatchFavorite([5], 1, 2)).toEqual({ next: [5, 1], change: 'added' });
  });

  it('ev sahibi favoriyse çıkar', () => {
    expect(toggleMatchFavorite([1, 5], 1, 2)).toEqual({ next: [5], change: 'removed' });
  });

  it('yalnız deplasman favoriyken (yıldız dolu) basınca deplasman çıkar — ev sahibi EKLENMEZ', () => {
    expect(toggleMatchFavorite([2, 5], 1, 2)).toEqual({ next: [5], change: 'removed' });
  });

  it('iki takım da favoriyse ikisi de çıkar (yıldız boşalır)', () => {
    expect(toggleMatchFavorite([1, 2, 5], 1, 2)).toEqual({ next: [5], change: 'removed' });
  });

  it('takım id yoksa değişiklik yok', () => {
    expect(toggleMatchFavorite([5], 0, 0)).toEqual({ next: [5], change: null });
    // Deplasman id'si yokken (0) favori listesindeki bir şey yanlışlıkla eşleşmez
    expect(toggleMatchFavorite([5], 3, 0)).toEqual({ next: [5, 3], change: 'added' });
  });

  it('girdi dizisini değiştirmez', () => {
    const ids = [1, 2];
    toggleMatchFavorite(ids, 1, 2);
    toggleMatchFavorite(ids, 3, 4);
    expect(ids).toEqual([1, 2]);
  });
});

describe('Favoriler (n) sayacı', () => {
  it('CSS değeri: 0 → yok, n → "(n)"', () => {
    expect(favCountCssValue(0)).toBeNull();
    expect(favCountCssValue(2)).toBe('"(2)"');
  });

  it('applyFavCount: 0 değişkeni kaldırır', () => {
    const props = new Map<string, string>();
    const style = { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => (props.delete(k), '') };
    applyFavCount(3, style);
    expect(props.get(HUB_FAV_COUNT_VAR)).toBe('"(3)"');
    applyFavCount(0, style);
    expect(props.has(HUB_FAV_COUNT_VAR)).toBe(false);
  });

  it('ön-boyama betiği parseLocalFavoriteIds ile aynı sayar (tekil, pozitif tamsayı; bozuk veri → yazmaz)', () => {
    for (const raw of ['[1,2,3]', '[1,1,"2",-3,0,2.5,"x"]', '[]', 'bozuk', '{"a":1}', null, '[7]']) {
      const n = parseLocalFavoriteIds(raw).length;
      expect(runBoot(raw)).toBe(favCountCssValue(n));
    }
  });

  it('CSS: Favoriler sekmesi ve çipi sayıyı değişkenden çizer', () => {
    expect(read('src/components/SubHeader/subHeader.module.scss')).toMatch(
      /\.tab\[data-tab='favorites'\]::after \{\s*content: var\(--hub-fav-count, none\);/,
    );
    expect(read('src/pages/index.module.scss')).toMatch(
      /\.statusChip\[data-tab='favorites'\]::after \{\s*content: var\(--hub-fav-count, none\);/,
    );
    expect(read('src/components/MatchHubPage/index.tsx')).toContain('__html: HUB_FAV_COUNT_BOOT_SCRIPT');
  });
});
