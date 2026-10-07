import { describe, expect, it } from 'vitest';
import { renderFrikikOgImage } from './frikikOgImage';

describe('frikik paylaşım görseli', () => {
  it('seviye kartı ve skorsuz kart PNG olarak çizilir', async () => {
    for (const info of [{ score: 12_375, level: 14 }, { score: 250, level: 1 }, null]) {
      const buf = Buffer.from(await renderFrikikOgImage(info).arrayBuffer());
      expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(buf.length).toBeGreaterThan(5000);
    }
  }, 20_000);
});
