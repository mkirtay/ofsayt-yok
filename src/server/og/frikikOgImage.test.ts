import { describe, expect, it } from 'vitest';
import { formatDayTr, renderFrikikOgImage } from './frikikOgImage';

describe('frikik paylaşım görseli', () => {
  it('seviye kartı ve skorsuz kart PNG olarak çizilir', async () => {
    for (const info of [{ score: 12_375, level: 14, day: '2026-10-08' }, { score: 250, level: 1, day: null }, null]) {
      const buf = Buffer.from(await renderFrikikOgImage(info).arrayBuffer());
      expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(buf.length).toBeGreaterThan(5000);
    }
  }, 20_000);

  it('gün etiketi TR', () => {
    expect(formatDayTr('2026-10-08')).toBe('8 Ekim 2026');
    expect(formatDayTr('2027-01-31')).toBe('31 Ocak 2027');
  });
});
