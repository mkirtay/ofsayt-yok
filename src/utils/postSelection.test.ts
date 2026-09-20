import { describe, expect, it } from 'vitest';
import { buildPostSelectionTarget, readSelectedPostId, withSelectedPost } from './postSelection';

describe('readSelectedPostId', () => {
  it('cuid biçimini okur, dizi ise ilk değeri alır', () => {
    expect(readSelectedPostId({ post: 'cmu9u2ux30000cat46b271pqh' })).toBe('cmu9u2ux30000cat46b271pqh');
    expect(readSelectedPostId({ post: ['cmu9u2ux30000cat46b271pqh', 'x'] })).toBe('cmu9u2ux30000cat46b271pqh');
  });
  it('geçersiz / eksik değerleri reddeder', () => {
    expect(readSelectedPostId({})).toBeNull();
    expect(readSelectedPostId({ post: '' })).toBeNull();
    expect(readSelectedPostId({ post: 'kısa' })).toBeNull();
    expect(readSelectedPostId({ post: '../../etc/passwd' })).toBeNull();
    expect(readSelectedPostId({ post: 'abc12345<script>' })).toBeNull();
  });
});

describe('withSelectedPost / buildPostSelectionTarget', () => {
  it('post ekler, diğer query paramlarını korur', () => {
    expect(withSelectedPost({ scope: 'official' }, 'abcdefgh12')).toEqual({ scope: 'official', post: 'abcdefgh12' });
  });
  it('null → post kaldırılır, başka param korunur', () => {
    expect(withSelectedPost({ scope: 'following', post: 'abcdefgh12' }, null)).toEqual({ scope: 'following' });
  });
  it('mevcut seçimi değiştirir ve boş değerleri düşürür', () => {
    expect(withSelectedPost({ post: 'oldoldold1', x: '' }, 'newnewnew2')).toEqual({ post: 'newnewnew2' });
  });
  it('hedef pathname + query üretir', () => {
    expect(buildPostSelectionTarget('/gundem', { scope: 'all' }, 'abcdefgh12')).toEqual({
      pathname: '/gundem',
      query: { scope: 'all', post: 'abcdefgh12' },
    });
  });
});
