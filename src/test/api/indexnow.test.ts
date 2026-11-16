import { describe, expect, it } from 'vitest';
import { pickIndexNowUrls } from '@/pages/api/cron/indexnow';

describe('IndexNow url seçimi', () => {
  it('yalnız verilen günlerde değişenler, tekrar yok', () => {
    expect(
      pickIndexNowUrls(
        [
          { loc: 'https://x/a', lastmod: '2026-11-16' },
          { loc: 'https://x/a', lastmod: '2026-11-16' },
          { loc: 'https://x/b', lastmod: '2026-10-01' },
          { loc: 'https://x/c' },
        ],
        ['2026-11-15', '2026-11-16'],
      ),
    ).toEqual(['https://x/a']);
  });
});
