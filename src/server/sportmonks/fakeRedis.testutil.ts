/**
 * Upstash Redis'in `cachedFetch`'in kullandığı alt kümesi (get / set ex|px|nx / del), kontrol
 * edilebilir saatle. Birden çok "instance" (ayrı modül örneği) aynı sahte Redis'i paylaşabilir.
 */
export type FakeRedis = {
  store: Map<string, { value: unknown; expiresAt: number }>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; px?: number; nx?: boolean }): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  hincrby(key: string, field: string, n: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  hgetall<T>(key: string): Promise<T | null>;
  pipeline(): { hincrby(key: string, field: string, n: number): unknown; expire(key: string, s: number): unknown; exec(): Promise<unknown[]> };
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
    async hincrby(key, field, n) {
      r.commands += 1;
      const e = alive(key);
      const hash = (e?.value as Record<string, number> | undefined) ?? {};
      hash[field] = (hash[field] ?? 0) + n;
      store.set(key, { value: hash, expiresAt: e?.expiresAt ?? now() + 365 * 24 * 3600 * 1000 });
      return hash[field]!;
    },
    async expire(key, seconds) {
      r.commands += 1;
      const e = alive(key);
      if (!e) return 0;
      e.expiresAt = now() + seconds * 1000;
      return 1;
    },
    async hgetall<T>(key: string) {
      r.commands += 1;
      const e = alive(key);
      return e ? (JSON.parse(JSON.stringify(e.value)) as T) : null;
    },
    pipeline() {
      const ops: (() => Promise<unknown>)[] = [];
      const p = {
        hincrby: (key: string, field: string, n: number) => (ops.push(() => r.hincrby(key, field, n)), p),
        expire: (key: string, s: number) => (ops.push(() => r.expire(key, s)), p),
        exec: async () => {
          const out: unknown[] = [];
          for (const op of ops) out.push(await op());
          return out;
        },
      };
      return p;
    },
  };
  return r;
}
