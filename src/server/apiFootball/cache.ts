/** AF yanıtları için ortak SWR sarmalı: önbellek anahtarı `af:<ad>`; hata → `{ ok: false }` (boş veriyle KARIŞMAZ). */
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { loadWithSwr } from '@/server/swrCache';

export type AfCached<T> = { ok: true; value: T; state: 'fresh' | 'stale' | 'computed' } | { ok: false };

export async function afCached<T>(name: string, freshSeconds: number, compute: () => Promise<T>): Promise<AfCached<T>> {
  try {
    // `{ v }` sarmalı: değer null/boş olsa da "üretildi" sayılsın (loadWithSwr null'ı hata sayar).
    const res = await loadWithSwr<{ v: T }>(`${cacheKeyPrefix()}af:${name}`, { freshSeconds }, async () => ({ v: await compute() }));
    if (!res) return { ok: false };
    return { ok: true, value: res.value.v, state: res.state };
  } catch (error) {
    console.error(`api-football (${name}) hata`, error instanceof Error ? error.message : 'unknown');
    return { ok: false };
  }
}
