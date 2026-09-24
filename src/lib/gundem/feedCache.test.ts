import { describe, expect, it } from 'vitest';
import { feedCacheKey, isFeedCacheable } from './feedCache';

describe('isFeedCacheable', () => {
  it('yalnızca oturumsuz + all/official paylaşılan cache alır', () => {
    expect(isFeedCacheable('all', null)).toBe(true);
    expect(isFeedCacheable('official', null)).toBe(true);
    expect(isFeedCacheable('following', null)).toBe(false);
  });

  it('oturumlu istek hiçbir scope\'ta cache almaz', () => {
    expect(isFeedCacheable('all', 'u1')).toBe(false);
    expect(isFeedCacheable('official', 'u1')).toBe(false);
    expect(isFeedCacheable('following', 'u1')).toBe(false);
  });
});

describe('feedCacheKey', () => {
  it('scope ve cursor anahtarı ayırır', () => {
    expect(feedCacheKey('all', null)).toBe('gundem:feed:v1:all:-');
    expect(feedCacheKey('all', 'abc')).not.toBe(feedCacheKey('all', null));
    expect(feedCacheKey('official', 'abc')).not.toBe(feedCacheKey('all', 'abc'));
  });
});
