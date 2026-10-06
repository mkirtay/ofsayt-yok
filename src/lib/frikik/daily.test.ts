import { describe, expect, it } from 'vitest';
import { dailySeed, dayLabel, turkeyDay } from './daily';

describe('günün frikiği tohumu', () => {
  it('gün TR saatine göre döner (UTC 21:00); tohum belirlenimci; etiket TR takvimi', () => {
    const before = Date.UTC(2026, 9, 6, 20, 59, 59);
    const after = Date.UTC(2026, 9, 6, 21, 0, 0);
    expect(turkeyDay(after)).toBe(turkeyDay(before) + 1);
    expect(dayLabel(turkeyDay(before))).toBe('2026-10-06');
    expect(dayLabel(turkeyDay(after))).toBe('2026-10-07');
    expect(dailySeed(20732)).toBe(dailySeed(20732));
    expect(dailySeed(20732)).not.toBe(dailySeed(20733));
    expect(Number.isInteger(dailySeed(1))).toBe(true);
    expect(dailySeed(1)).toBeGreaterThanOrEqual(0);
  });
});
