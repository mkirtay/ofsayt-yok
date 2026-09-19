import { describe, expect, it } from 'vitest';
import { AVATAR_GALLERY, avatarUrl, isGalleryAvatarUrl } from './avatars';
import { parseHistoryQuery, HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from './creditHistory';
import { mergeFavoriteIds, parseLocalFavoriteIds } from '@/utils/favoriteImport';

describe('avatar galerisi', () => {
  it('galerideki her avatar geçerli; galeri dışı/göreli yol ve http reddedilir', () => {
    for (const id of AVATAR_GALLERY) expect(isGalleryAvatarUrl(avatarUrl(id))).toBe(true);
    for (const bad of ['/avatars/../secret.svg', '/avatars/unknown.svg', '/images/logo.svg', 'https://x.com/a.png']) {
      expect(isGalleryAvatarUrl(bad)).toBe(false);
    }
  });
  it('galeri 8–12 avatar', () => {
    expect(AVATAR_GALLERY.length).toBeGreaterThanOrEqual(8);
    expect(AVATAR_GALLERY.length).toBeLessThanOrEqual(12);
  });
});

describe('parseHistoryQuery', () => {
  it('varsayılan 20; üst sınır 50; geçersiz limit/cursor güvenli', () => {
    expect(parseHistoryQuery({})).toEqual({ limit: HISTORY_DEFAULT_LIMIT, cursor: null });
    expect(parseHistoryQuery({ limit: '500' }).limit).toBe(HISTORY_MAX_LIMIT);
    expect(parseHistoryQuery({ limit: '-3' }).limit).toBe(HISTORY_DEFAULT_LIMIT);
    expect(parseHistoryQuery({ limit: 'abc' }).limit).toBe(HISTORY_DEFAULT_LIMIT);
    expect(parseHistoryQuery({ cursor: 'clx1234567890abcdef' }).cursor).toBe('clx1234567890abcdef');
    expect(parseHistoryQuery({ cursor: "x'; DROP" }).cursor).toBeNull();
  });
});

describe('favori içe aktarma', () => {
  it('parseLocalFavoriteIds: bozuk/boş → []; tekil ve pozitif tamsayı', () => {
    expect(parseLocalFavoriteIds(null)).toEqual([]);
    expect(parseLocalFavoriteIds('bozuk')).toEqual([]);
    expect(parseLocalFavoriteIds('{"a":1}')).toEqual([]);
    expect(parseLocalFavoriteIds('[34, "88", 34, -1, 0, "x", 1.5]')).toEqual([34, 88]);
  });
  it('mergeFavoriteIds: mevcutlar korunur, yalnızca yeniler eklenir, 50 üst sınır', () => {
    expect(mergeFavoriteIds([34, 88], [88, 688, 1])).toEqual({ merged: [34, 88, 688, 1], added: [688, 1] });
    expect(mergeFavoriteIds([1, 2], [1, 2]).added).toEqual([]);
    const existing = Array.from({ length: 49 }, (_, i) => i + 1);
    const r = mergeFavoriteIds(existing, [100, 101, 102]);
    expect(r.merged).toHaveLength(50);
    expect(r.added).toEqual([100]);
  });
});
