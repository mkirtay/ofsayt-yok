import { describe, expect, it } from 'vitest';
import { feedCacheKey, isFeedCacheable } from './feedCache';

describe('isFeedCacheable', () => {
  it('yalnızca oturumsuz + all/official paylaşılan cache alır', () => {
    expect(isFeedCacheable('all', null)).toBe(true);
    expect(isFeedCacheable('official', null)).toBe(true);
    expect(isFeedCacheable('match', null)).toBe(true);
    expect(isFeedCacheable('following', null)).toBe(false);
  });

  it('oturumlu istek hiçbir scope\'ta cache almaz', () => {
    expect(isFeedCacheable('all', 'u1')).toBe(false);
    expect(isFeedCacheable('official', 'u1')).toBe(false);
    expect(isFeedCacheable('following', 'u1')).toBe(false);
    expect(isFeedCacheable('match', 'u1')).toBe(false);
  });
});

describe('feedCacheKey', () => {
  const on = { matchId: null, matchPostsInAll: true };

  it('scope ve cursor anahtarı ayırır', () => {
    expect(feedCacheKey('all', null, on)).toBe('gundem:feed:v2:all:m-:k1:-');
    expect(feedCacheKey('all', 'abc', on)).not.toBe(feedCacheKey('all', null, on));
    expect(feedCacheKey('official', 'abc', on)).not.toBe(feedCacheKey('all', 'abc', on));
  });

  it('all ile match farklı anahtarda; maçlar birbirinden ayrı', () => {
    expect(feedCacheKey('match', null, on)).not.toBe(feedCacheKey('all', null, on));
    expect(feedCacheKey('match', null, { ...on, matchId: '101' })).not.toBe(feedCacheKey('match', null, { ...on, matchId: '102' }));
    expect(feedCacheKey('match', null, { ...on, matchId: '101' })).not.toBe(feedCacheKey('match', null, on));
  });

  it('GUNDEM_MATCH_POSTS_IN_ALL değişince anahtar değişir', () => {
    expect(feedCacheKey('all', null, { ...on, matchPostsInAll: false })).not.toBe(feedCacheKey('all', null, on));
    expect(feedCacheKey('all', 'abc', { ...on, matchPostsInAll: false })).not.toBe(feedCacheKey('all', 'abc', on));
  });
});
