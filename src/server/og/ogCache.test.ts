import { describe, expect, it } from 'vitest';
import { OG_CACHE, matchOgCacheControl } from './ogCache';

const NOW = Date.parse('2026-10-02T12:00:00Z');

describe('matchOgCacheControl', () => {
  it('bitmiş: 1 yıl, immutable; canlı / devre arası: 60 sn; diğer: 1 sa', () => {
    expect(matchOgCacheControl({ status: 'FINISHED' }, NOW)).toBe(OG_CACHE.finished);
    expect(OG_CACHE.finished).toContain('s-maxage=31536000');
    expect(OG_CACHE.finished).toContain('immutable');
    expect(matchOgCacheControl({ status: 'IN PLAY' }, NOW)).toBe(OG_CACHE.live);
    expect(matchOgCacheControl({ status: 'HALF TIME BREAK' }, NOW)).toBe(OG_CACHE.live);
    expect(matchOgCacheControl({ status: 'POSTPONED' }, NOW)).toBe(OG_CACHE.other);
  });

  it('başlamamış: başlama saatine kadar, en çok 6 sa, en az 1 dk', () => {
    expect(matchOgCacheControl({ status: 'NOT STARTED', date: '2026-10-02', scheduled: '12:30' }, NOW)).toBe(
      'public, max-age=1800, s-maxage=1800',
    );
    expect(matchOgCacheControl({ status: 'NOT STARTED', date: '2026-10-05', scheduled: '19:00' }, NOW)).toBe(
      'public, max-age=3600, s-maxage=21600',
    );
    // Saati geçmiş ama durumu güncellenmemiş maç
    expect(matchOgCacheControl({ status: 'NOT STARTED', date: '2026-10-02', scheduled: '11:00' }, NOW)).toBe(
      'public, max-age=60, s-maxage=60',
    );
  });
});
