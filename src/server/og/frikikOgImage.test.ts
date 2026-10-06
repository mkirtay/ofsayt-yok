import { describe, expect, it } from 'vitest';
import { renderFrikikOgImage } from './frikikOgImage';

describe('frikik paylaşım görseli', () => {
  it('seri skoru, seviye kartı ve skorsuz kart PNG olarak çizilir', async () => {
    for (const info of [{ score: 850, level: null }, { score: 12_375, level: 14 }, null]) {
      const buf = Buffer.from(await renderFrikikOgImage(info).arrayBuffer());
      expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(buf.length).toBeGreaterThan(5000);
    }
  }, 20_000);
});
