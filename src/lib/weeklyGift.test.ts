import { describe, expect, it } from 'vitest';
import { isWeeklyGiftHiddenPath, seenThisWeek, weeklyGiftKey } from './weeklyGift';

// 2026-11-23 Pazartesi 10:00 TSİ = 07:00 UTC
const MON = Date.parse('2026-11-23T07:00:00Z');
const SUN = Date.parse('2026-11-29T20:00:00Z'); // Pazar 23:00 TSİ
const NEXT_MON = Date.parse('2026-11-29T21:30:00Z'); // Pazartesi 00:30 TSİ

describe('weeklyGift', () => {
  it('TR haftası başına tek anahtar; Pazartesi 00:00 TSİ yenilenir', () => {
    expect(weeklyGiftKey(MON)).toBe(weeklyGiftKey(SUN));
    expect(weeklyGiftKey(NEXT_MON)).not.toBe(weeklyGiftKey(SUN));
    expect(weeklyGiftKey(MON)).toMatch(/^weekly-gift:\d{4}-W\d{2}$/);
  });
  it('bu hafta görüldü mü', () => {
    const week = weeklyGiftKey(MON).slice('weekly-gift:'.length);
    expect(seenThisWeek(week, SUN)).toBe(true);
    expect(seenThisWeek(week, NEXT_MON)).toBe(false);
    expect(seenThisWeek(null, MON)).toBe(false);
  });
  it('giriş / admin / oyun sayfalarında çıkmaz', () => {
    for (const p of ['/auth/signin', '/admin', '/frikik', '/mini-saha', '/odeme']) expect(isWeeklyGiftHiddenPath(p)).toBe(true);
    for (const p of ['/', '/matches/[id]', '/gundem']) expect(isWeeklyGiftHiddenPath(p)).toBe(false);
  });
});
