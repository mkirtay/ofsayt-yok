/**
 * Kural Köşesi — günün bilgisi ve "Biliyor muydun?" baloncuğunun kuralları (saf fonksiyonlar; bkz. schedule.test.ts).
 *
 * - Gün, İstanbul saatine göre: aynı gün herkes aynı bilgiyi görür.
 * - Baloncuk: günde en çok 3 kez, aralarında en az 2 saat; ziyaretin ilk 15 sn'sinde çıkmaz; kullanıcı o gün paneli
 *   açtıysa o gün bir daha çıkmaz (panel açıkken çıkmaması bileşende).
 * - Durum localStorage'da tek anahtarda; depolama yoksa (gizli mod, engelli çerez) çağıran baloncuğu ve sarı noktayı
 *   hiç göstermez.
 */
export const PEEK_VISIBLE_MS = 6_000;
export const PEEK_MAX_PER_DAY = 3;
export const PEEK_MIN_GAP_MS = 2 * 60 * 60 * 1000;
export const PEEK_VISIT_GRACE_MS = 15_000;

export const STORAGE_KEY = 'oy_kural_kosesi';
const VISIT_KEY = 'oy_kural_kosesi_visit';
const TIME_ZONE = 'Europe/Istanbul';

export type KuralKosesiState = {
  /** Paneli en son açtığı gün (YYYY-MM-DD, İstanbul). O gün = günün bilgisi görüldü. */
  openedDay?: string;
  /** Baloncuk sayacının ait olduğu gün ve o günkü gösterim sayısı. */
  peekDay?: string;
  peekCount?: number;
  /** Son baloncuk zamanı (ms). */
  lastPeekAt?: number;
};

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** İstanbul takvim günü, YYYY-MM-DD. */
export function dayKey(now: number): string {
  return dayFormatter.format(now);
}

/** Günün bilgisinin sırası: İstanbul gününün epoch'tan gün sayısı mod toplam. */
export function dailyIndex(now: number, total: number): number {
  if (total <= 0) return 0;
  const [y, m, d] = dayKey(now).split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return ((days % total) + total) % total;
}

export function isSeenToday(state: KuralKosesiState, now: number): boolean {
  return state.openedDay === dayKey(now);
}

/**
 * Baloncuğun en erken gösterilebileceği an; bugün artık gösterilmeyecekse null.
 * Dönen an `now`dan önce olamaz.
 */
export function nextPeekAt(state: KuralKosesiState, now: number, visitStart: number): number | null {
  const today = dayKey(now);
  if (state.openedDay === today) return null;
  const count = state.peekDay === today ? (state.peekCount ?? 0) : 0;
  if (count >= PEEK_MAX_PER_DAY) return null;
  const afterGap = state.lastPeekAt != null ? state.lastPeekAt + PEEK_MIN_GAP_MS : 0;
  return Math.max(now, visitStart + PEEK_VISIT_GRACE_MS, afterGap);
}

export function recordPeek(state: KuralKosesiState, now: number): KuralKosesiState {
  const today = dayKey(now);
  const count = state.peekDay === today ? (state.peekCount ?? 0) : 0;
  return { ...state, peekDay: today, peekCount: count + 1, lastPeekAt: now };
}

export function recordOpen(state: KuralKosesiState, now: number): KuralKosesiState {
  return { ...state, openedDay: dayKey(now) };
}

// ── Depolama ────────────────────────────────────────────────────────────────

/** Yazılabilir localStorage ya da null (SSR, gizli mod, engelli site verisi). */
export function getStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probe = `${STORAGE_KEY}_probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function readState(storage: Storage): KuralKosesiState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as KuralKosesiState) : {};
  } catch {
    return {};
  }
}

export function writeState(storage: Storage, state: KuralKosesiState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Kota dolu vb.: baloncuk bu ziyarette yine kurallara göre davranır, kalıcı kayıt olmaz.
  }
}

/** Ziyaretin başladığı an: sekme oturumu boyunca sabit (sayfa geçişi/yenileme 15 sn'yi sıfırlamaz). */
export function visitStartedAt(now: number): number {
  try {
    const saved = Number(window.sessionStorage.getItem(VISIT_KEY));
    if (saved > 0 && saved <= now) return saved;
    window.sessionStorage.setItem(VISIT_KEY, String(now));
  } catch {
    // sessionStorage yoksa bu sayfa yüklemesi ziyaretin başı sayılır.
  }
  return now;
}
