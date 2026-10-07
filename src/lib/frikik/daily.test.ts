import { describe, expect, it } from 'vitest';
import { DAY_GRACE_MS, dailySeed, dayLabel, isAcceptedDay, monthKey, parseDayKey, todayKey, turkeyDay } from './daily';

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

  it('aynı gün içinde her an aynı tohum; gün değişince farklı (sunucu ve istemci aynı anahtarı üretir)', () => {
    const morning = Date.UTC(2026, 9, 7, 5, 0, 0); // TR 08:00
    const night = Date.UTC(2026, 9, 7, 20, 30, 0); // TR 23:30
    expect(dailySeed(turkeyDay(morning))).toBe(dailySeed(turkeyDay(night)));
    expect(todayKey(morning)).toBe('2026-10-07');
    expect(todayKey(night)).toBe('2026-10-07');
    expect(todayKey(night + 30 * 60_000)).toBe('2026-10-08');
    expect(dailySeed(parseDayKey('2026-10-07')!)).toBe(dailySeed(turkeyDay(morning)));
  });

  it('gün anahtarı: biçim, takvim ve aralık denetimi; ay anahtarı', () => {
    expect(parseDayKey('2026-10-07')).toBe(turkeyDay(Date.UTC(2026, 9, 7, 5)));
    for (const bad of ['2026-10-7', '2026-13-01', '2026-02-30', '2025-12-31', '2100-01-01', 20261007, null, '2026-10-07T00:00']) {
      expect(parseDayKey(bad), String(bad)).toBeNull();
    }
    expect(monthKey('2026-10-07')).toBe('2026-10');
  });

  it('gece yarısı toleransı: dün yalnız ilk 10 dakikada kabul; eski / gelecek gün asla', () => {
    const midnight = Date.UTC(2026, 9, 6, 21, 0, 0); // TR 2026-10-07 00:00
    const today = turkeyDay(midnight);
    expect(isAcceptedDay(today, midnight)).toBe(true);
    expect(isAcceptedDay(today - 1, midnight + DAY_GRACE_MS - 1)).toBe(true);
    expect(isAcceptedDay(today - 1, midnight + DAY_GRACE_MS)).toBe(false);
    expect(isAcceptedDay(today - 2, midnight + 1000)).toBe(false);
    expect(isAcceptedDay(today + 1, midnight + 1000)).toBe(false);
    expect(isAcceptedDay(today, midnight + 12 * 3_600_000)).toBe(true);
  });
});
