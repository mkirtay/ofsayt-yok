import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

// t taklidi: anahtar + parametre — gerçek çeviriden bağımsız, yalnızca eşikleri doğrular.
const t = (key: string, opts?: Record<string, unknown>) => `${key.replace('common:relativeTime.', '')}${opts ? `:${opts.count}` : ''}`;
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('formatRelativeTime', () => {
  it('< 1 dk → justNow', () => {
    expect(formatRelativeTime(ago(30_000), t, NOW)).toBe('justNow');
  });
  it('dakika / saat / gün eşikleri', () => {
    expect(formatRelativeTime(ago(60_000), t, NOW)).toBe('minutesAgo:1');
    expect(formatRelativeTime(ago(59 * 60_000), t, NOW)).toBe('minutesAgo:59');
    expect(formatRelativeTime(ago(60 * 60_000), t, NOW)).toBe('hoursAgo:1');
    expect(formatRelativeTime(ago(23 * 3_600_000), t, NOW)).toBe('hoursAgo:23');
    expect(formatRelativeTime(ago(24 * 3_600_000), t, NOW)).toBe('daysAgo:1');
    expect(formatRelativeTime(ago(72 * 3_600_000), t, NOW)).toBe('daysAgo:3');
  });
  it('gelecek ve geçersiz tarih → justNow (NaN metni basılmaz)', () => {
    expect(formatRelativeTime(new Date(NOW + 60_000).toISOString(), t, NOW)).toBe('justNow');
    expect(formatRelativeTime('geçersiz', t, NOW)).toBe('justNow');
  });
});
