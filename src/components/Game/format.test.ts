import { describe, expect, it } from 'vitest';
import { formatKickoff, formatLeft, weekNumber } from './format';

const t = (k: string, o?: Record<string, unknown>) => `${k}:${JSON.stringify(o)}`;

describe('oyun gösterim yardımcıları', () => {
  it('kalan süre', () => {
    expect(formatLeft(30_000, t)).toBe('time.m:{"m":1}');
    expect(formatLeft(3 * 3_600_000 + 12 * 60_000, t)).toBe('time.h:{"h":3,"m":12}');
    expect(formatLeft(2 * 86_400_000 + 3 * 3_600_000, t)).toBe('time.d:{"d":2,"h":3}');
  });
  it('başlama saati TR saatiyle', () => {
    expect(formatKickoff('2026-10-17T16:00:00Z', 'tr')).toMatch(/19:00/);
  });
  it('hafta numarası', () => expect(weekNumber('2026-W07')).toBe(7));
});
