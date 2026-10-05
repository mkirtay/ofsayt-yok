/**
 * Hesaplanmış sayfa verisi için Redis stale-while-revalidate:
 * - taze → hemen döner;
 * - eski (taze süre dolmuş, saklama süresi içinde) → eski değer HEMEN döner, yenisi arka planda üretilir;
 * - hiç yok → eşzamanlı üretilir (ilk üretim yavaş olabilir).
 * Aynı anahtar için aynı anda tek üretim: Redis `SET NX PX` kilidi. Kilit başkasındaysa ve değer hiç yoksa kısa süre
 * onun yazmasını bekler, olmazsa kendisi üretir. Redis yoksa / erişilemiyorsa her seferinde üretir (fail-open).
 */
import { getRedisClient, withRedis } from '@/lib/redis';
import { runInBackground } from '@/server/backgroundTask';

type Entry<T> = { v: T; at: number };

export type SwrOptions = {
  /** Bu süre boyunca yeniden üretilmez (sn). */
  freshSeconds: number;
  /** Redis'te saklama (eski değerin verilebileceği) toplam süre (sn); varsayılan 7 gün. */
  keepSeconds?: number;
  /** Kilit süresi (ms) — üretim bundan uzun sürerse ikinci bir üretim başlayabilir. */
  lockMs?: number;
  /** Değer yokken kilit sahibini bekleme süresi (ms). */
  waitMs?: number;
  now?: () => number;
};

export type SwrResult<T> = { value: T; state: 'fresh' | 'stale' | 'computed' };

const DEFAULT_KEEP = 7 * 24 * 60 * 60;
const POLL_MS = 200;

async function readEntry<T>(key: string): Promise<Entry<T> | null> {
  return withRedis((r) => r.get<Entry<T>>(key), null);
}

async function writeEntry<T>(key: string, v: T, at: number, keepSeconds: number): Promise<void> {
  await withRedis((r) => r.set(key, { v, at } satisfies Entry<T>, { ex: keepSeconds }), null);
}

async function tryLock(key: string, lockMs: number): Promise<boolean> {
  if (!getRedisClient()) return true;
  return withRedis(async (r) => (await r.set(`${key}:lock`, 1, { nx: true, px: lockMs })) === 'OK', true);
}

async function unlock(key: string): Promise<void> {
  await withRedis((r) => r.del(`${key}:lock`), 0);
}

/**
 * @param compute `null` dönerse (geçici hata) yazılmaz; eski değer varsa o kalır.
 * @returns değer hiç üretilemediyse `null`.
 */
export async function loadWithSwr<T>(key: string, opts: SwrOptions, compute: () => Promise<T | null>): Promise<SwrResult<T> | null> {
  const now = opts.now ?? Date.now;
  const keep = opts.keepSeconds ?? DEFAULT_KEEP;
  const lockMs = opts.lockMs ?? 60_000;
  const refresh = async (): Promise<T | null> => {
    const v = await compute();
    if (v != null) await writeEntry(key, v, now(), keep);
    return v;
  };

  const entry = await readEntry<T>(key);
  if (entry && now() - entry.at < opts.freshSeconds * 1000) return { value: entry.v, state: 'fresh' };

  if (entry) {
    // Eski değer hemen; yenileme arka planda ve tek seferde.
    if (await tryLock(key, lockMs)) {
      runInBackground(async () => {
        try {
          await refresh();
        } finally {
          await unlock(key);
        }
      });
    }
    return { value: entry.v, state: 'stale' };
  }

  // Hiç değer yok: eşzamanlı üretim; kilit başkasındaysa kısa süre onun yazmasını bekle.
  const locked = await tryLock(key, lockMs);
  if (!locked) {
    const deadline = now() + (opts.waitMs ?? 8_000);
    while (now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const e = await readEntry<T>(key);
      if (e) return { value: e.v, state: 'fresh' };
    }
  }
  try {
    const v = await refresh();
    return v == null ? null : { value: v, state: 'computed' };
  } finally {
    if (locked) await unlock(key);
  }
}

/** Yalnız okur (üretmez): taze ya da eski değer, yoksa null. Başka bir sayfanın hesabını ek istek atmadan kullanmak için. */
export async function peekSwr<T>(key: string): Promise<T | null> {
  return (await readEntry<T>(key))?.v ?? null;
}
