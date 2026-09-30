import { describe, it, expect } from 'vitest';
import { cleanUtmValue, parseSignupAttribution } from './signupAttribution';

const NOW = Date.parse('2026-09-30T12:00:00Z');

describe('signupAttribution', () => {
  it('utm değeri: kırpılır, 100 karakterle sınırlı; HTML/kontrol karakteri reddedilir', () => {
    expect(cleanUtmValue('  instagram ')).toBe('instagram');
    expect(cleanUtmValue('derbi_2026-10-26')).toBe('derbi_2026-10-26');
    expect(cleanUtmValue('Süper Lig | Ekim')).toBe('Süper Lig | Ekim');
    expect(cleanUtmValue('x'.repeat(150))).toHaveLength(100);
    expect(cleanUtmValue('<script>')).toBeNull();
    expect(cleanUtmValue('a\nb')).toBeNull();
    expect(cleanUtmValue('')).toBeNull();
    expect(cleanUtmValue(42)).toBeNull();
  });

  it('geçerli gövde → alanlar; utm yoksa null, zaman yine yazılır (doğrudan trafik)', () => {
    expect(parseSignupAttribution({ source: 'x', medium: 'social', campaign: null, firstTouchAt: '2026-09-30T11:00:00Z' }, NOW)).toEqual({
      signupUtmSource: 'x',
      signupUtmMedium: 'social',
      signupUtmCampaign: null,
      firstTouchAt: new Date('2026-09-30T11:00:00Z'),
    });
    expect(parseSignupAttribution({ firstTouchAt: '2026-09-30T11:00:00Z' }, NOW)?.signupUtmSource).toBeNull();
  });

  it('zaman yok/bozuk/gelecekte/7 günden eski → null (kaynak yazılmaz)', () => {
    expect(parseSignupAttribution(null, NOW)).toBeNull();
    expect(parseSignupAttribution({ source: 'x' }, NOW)).toBeNull();
    expect(parseSignupAttribution({ firstTouchAt: 'dün' }, NOW)).toBeNull();
    expect(parseSignupAttribution({ firstTouchAt: '2026-09-30T13:00:00Z' }, NOW)).toBeNull();
    expect(parseSignupAttribution({ firstTouchAt: '2026-09-20T12:00:00Z' }, NOW)).toBeNull();
  });
});
