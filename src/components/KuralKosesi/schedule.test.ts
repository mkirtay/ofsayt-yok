import { describe, expect, it } from 'vitest';
import {
  PEEK_MIN_GAP_MS,
  PEEK_VISIT_GRACE_MS,
  dailyIndex,
  dayKey,
  isSeenToday,
  nextPeekAt,
  readState,
  recordOpen,
  recordPeek,
  writeState,
} from './schedule';
import { isKuralKosesiHidden } from './paths';

// 2026-10-01 12:00 İstanbul (UTC+3)
const NOON = Date.UTC(2026, 9, 1, 9, 0, 0);
const HOUR = 60 * 60 * 1000;

describe('dayKey / dailyIndex', () => {
  it('günü İstanbul saatine göre verir', () => {
    expect(dayKey(Date.UTC(2026, 8, 30, 20, 59))).toBe('2026-09-30'); // 23:59 TR
    expect(dayKey(Date.UTC(2026, 8, 30, 21, 0))).toBe('2026-10-01'); // 00:00 TR
  });

  it('aynı gün aynı, ertesi gün bir sonraki bilgi', () => {
    const morning = Date.UTC(2026, 8, 30, 21, 30);
    expect(dailyIndex(morning, 8)).toBe(dailyIndex(NOON, 8));
    expect(dailyIndex(NOON + 24 * HOUR, 8)).toBe((dailyIndex(NOON, 8) + 1) % 8);
  });

  it('her zaman 0..total-1 aralığında', () => {
    for (let d = 0; d < 20; d++) {
      const i = dailyIndex(NOON + d * 24 * HOUR, 8);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(8);
    }
    expect(dailyIndex(NOON, 0)).toBe(0);
  });
});

describe('nextPeekAt', () => {
  it('ziyaretin ilk 15 saniyesinde çıkmaz', () => {
    expect(nextPeekAt({}, NOON, NOON)).toBe(NOON + PEEK_VISIT_GRACE_MS);
    expect(nextPeekAt({}, NOON + 20_000, NOON)).toBe(NOON + 20_000);
  });

  it('iki baloncuk arasında en az 2 saat', () => {
    const state = recordPeek({}, NOON);
    expect(nextPeekAt(state, NOON + HOUR, NOON - HOUR)).toBe(NOON + PEEK_MIN_GAP_MS);
  });

  it('günde en çok 3 kez', () => {
    let state = {};
    for (let i = 0; i < 3; i++) state = recordPeek(state, NOON - 8 * HOUR + i * 3 * HOUR);
    expect(nextPeekAt(state, NOON + 3 * HOUR, 0)).toBeNull();
  });

  it('sayaç ertesi gün sıfırlanır', () => {
    let state = {};
    for (let i = 0; i < 3; i++) state = recordPeek(state, NOON - 8 * HOUR + i * 3 * HOUR);
    const tomorrow = NOON + 24 * HOUR;
    expect(nextPeekAt(state, tomorrow, 0)).toBe(tomorrow);
  });

  it('panel o gün açıldıysa o gün çıkmaz, ertesi gün çıkar', () => {
    const state = recordOpen({}, NOON);
    expect(nextPeekAt(state, NOON + HOUR, 0)).toBeNull();
    expect(isSeenToday(state, NOON + HOUR)).toBe(true);
    expect(isSeenToday(state, NOON + 24 * HOUR)).toBe(false);
    expect(nextPeekAt(state, NOON + 24 * HOUR, 0)).toBe(NOON + 24 * HOUR);
  });
});

describe('depolama', () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k) => map.get(k) ?? null,
      key: (i) => [...map.keys()][i] ?? null,
      removeItem: (k) => void map.delete(k),
      setItem: (k, v) => void map.set(k, v),
    };
  }

  it('yazılan durum geri okunur', () => {
    const s = memoryStorage();
    writeState(s, recordPeek({}, NOON));
    expect(readState(s)).toEqual({ peekDay: '2026-10-01', peekCount: 1, lastPeekAt: NOON });
  });

  it('bozuk kayıt boş durum sayılır', () => {
    const s = memoryStorage();
    s.setItem('oy_kural_kosesi', '{bozuk');
    expect(readState(s)).toEqual({});
  });
});

describe('isKuralKosesiHidden', () => {
  it('giriş/kayıt ve admin sayfalarında gizli', () => {
    expect(isKuralKosesiHidden('/auth/signin')).toBe(true);
    expect(isKuralKosesiHidden('/auth/signup')).toBe(true);
    expect(isKuralKosesiHidden('/admin/gundem-kuyruk')).toBe(true);
  });

  it('diğer sayfalarda görünür', () => {
    expect(isKuralKosesiHidden('/')).toBe(false);
    expect(isKuralKosesiHidden('/matches/[slug]')).toBe(false);
    expect(isKuralKosesiHidden('/authors')).toBe(false);
  });
});
