import { describe, expect, it } from 'vitest';
import { renderFrikikOgImage } from './frikikOgImage';

describe('frikik paylaşım görseli', () => {
  it('skorlu ve skorsuz kart PNG olarak çizilir', async () => {
    for (const score of [850, null]) {
      const buf = Buffer.from(await renderFrikikOgImage(score).arrayBuffer());
      expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(buf.length).toBeGreaterThan(5000);
    }
  }, 20_000);
});
