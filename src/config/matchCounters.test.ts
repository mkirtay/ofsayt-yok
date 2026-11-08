import { describe, expect, it } from 'vitest';
import {
  COUNTERS_MAX_IDS,
  canSeeMatchCounters,
  formatCount,
  isCounterBot,
  parseCounterIds,
  parseCounterMatchId,
} from './matchCounters';

const CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('canSeeMatchCounters', () => {
  it('bayrak kapalıyken yalnız ADMIN', () => {
    expect(canSeeMatchCounters({ role: 'ADMIN' }, false)).toBe(true);
    expect(canSeeMatchCounters({ role: 'USER' }, false)).toBe(false);
    expect(canSeeMatchCounters(null, false)).toBe(false);
    expect(canSeeMatchCounters(undefined, false)).toBe(false);
  });
  it('bayrak açıkken herkes', () => {
    expect(canSeeMatchCounters(null, true)).toBe(true);
  });
  it('varsayılan bayrak kapalı', async () => {
    const mod = await import('./matchCounters');
    expect(mod.MATCH_COUNTERS_PUBLIC).toBe(false);
  });
});

describe('isCounterBot', () => {
  it('gerçek tarayıcı sayılır', () => {
    expect(isCounterBot(CHROME)).toBe(false);
  });
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 Chrome-Lighthouse',
    'curl/8.4.0',
    '',
    null,
  ])('bot/araç sayılmaz: %s', (ua) => {
    expect(isCounterBot(ua)).toBe(true);
  });
});

describe('parseCounterIds', () => {
  it('geçersizleri ve tekrarları atar', () => {
    expect(parseCounterIds('1,2,abc,2,-5,,  3 ')).toEqual(['1', '2', '3']);
    expect(parseCounterIds(['4,5', '6'])).toEqual(['4', '5', '6']);
    expect(parseCounterIds(undefined)).toEqual([]);
  });
  it('en çok COUNTERS_MAX_IDS', () => {
    const raw = Array.from({ length: COUNTERS_MAX_IDS + 50 }, (_, i) => String(i + 1)).join(',');
    expect(parseCounterIds(raw)).toHaveLength(COUNTERS_MAX_IDS);
  });
  it('tek id', () => {
    expect(parseCounterMatchId('19135003')).toBe('19135003');
    expect(parseCounterMatchId('-3')).toBeNull();
    expect(parseCounterMatchId('1234567890123')).toBeNull();
  });
});

describe('formatCount', () => {
  it('kısaltır', () => {
    expect(formatCount(753, 'tr')).toBe('753');
    expect(formatCount(1530, 'tr')).toBe('1,5B');
    expect(formatCount(1530, 'en')).toBe('1.5K');
    expect(formatCount(250_000, 'en')).toBe('250K');
    expect(formatCount(2_400_000, 'tr')).toBe('2,4Mn');
  });
});
