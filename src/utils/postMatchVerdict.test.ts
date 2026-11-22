import { describe, expect, it } from 'vitest';
import { postMatchVerdicts } from './postMatchVerdict';

describe('AI ne dedi, ne oldu', () => {
  it('tam skordan ve devre skorundan tuttu / tutmadı; bilinmeyen null', () => {
    const v = postMatchVerdicts(
      [
        { key: 'home', pct: 60 },
        { key: 'over25', pct: 55 },
        { key: 'htOver05', pct: 70 },
        { key: 'bttsFirstHalf', pct: 30 },
      ],
      { ft_score: '2-0', ht_score: '0-0' },
    );
    expect(v.map((p) => p.hit)).toEqual([true, false, false, false]);
    expect(postMatchVerdicts([{ key: 'htOver15', pct: 40 }], { ft_score: '1-1' })[0]!.hit).toBeNull();
  });
});
