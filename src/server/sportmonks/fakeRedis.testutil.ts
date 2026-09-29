/**
 * Upstash Redis'in `cachedFetch`'in kullandığı alt kümesi (get / set ex|px|nx / del), kontrol
 * edilebilir saatle. Birden çok "instance" (ayrı modül örneği) aynı sahte Redis'i paylaşabilir.
 */
export type FakeRedis = {
  store: Map<string, { value: unknown; expiresAt: number }>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; px?: number; nx?: boolean }): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  commands: number;
};

export function createFakeRedis(now: () => number): FakeRedis {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  const alive = (key: string) => {
    const e = store.get(key);
    if (!e) return null;
    if (e.expiresAt <= now()) {
      store.delete(key);
      return null;
    }
    return e;
  };
  const r: FakeRedis = {
    store,
    commands: 0,
    async get<T>(key: string) {
      r.commands += 1;
      const e = alive(key);
      // Upstash JSON olarak saklar: referans paylaşımı olmasın
      return e ? (JSON.parse(JSON.stringify(e.value)) as T) : null;
    },
    async set(key, value, opts = {}) {
      r.commands += 1;
      if (opts.nx && alive(key)) return null;
      const ttlMs = opts.px ?? (opts.ex != null ? opts.ex * 1000 : 365 * 24 * 3600 * 1000);
      store.set(key, { value: JSON.parse(JSON.stringify(value)), expiresAt: now() + ttlMs });
      return 'OK';
    },
    async del(key) {
      r.commands += 1;
      return store.delete(key) ? 1 : 0;
    },
  };
  return r;
}
