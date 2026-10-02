/**
 * Sportmonks'a giden TEK kapı (sunucu tarafı) — hem tarayıcı proxy'si (`/api/sportmonks/...`) hem de
 * sunucu içi çağrılar (SSR, API route'ları, cron/bot) buradan geçer. Amaç: upstream istek sayısı
 * ziyaretçi sayısından bağımsız olsun.
 *
 * - Anahtar: `api_token` hariç normalize path + sıralı query.
 * - Süre: `sportmonksCacheTtl` (içeriğe/maç durumuna göre). "Yok" cevapları da (404/403/422, boş 200)
 *   cache'lenir (negatif cache).
 * - Katmanlar: instance içi bellek (L1, yalnız taze kayıt) → Redis (taze + eski).
 * - Tekil uçuş: aynı instance'ta aynı anahtar için tek upstream isteği; instance'lar arasında Redis
 *   `SET NX PX` kilidi — kilidi alamayan eski veri varsa onu verir, yoksa kısa süre cache'i yoklar.
 * - Sportmonks 429/5xx/ağ hatası/zaman aşımı → son geçerli veri (`stale: true`).
 * - Zaman aşımı (AbortController): varsayılan `SPORTMONKS_TIMEOUT_MS.api` (API route'ları, cron, bot); sayfa
 *   render'ı `withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, …)` ile daha kısa bütçe verir. Bütçe çağrı
 *   başınadır ve kilit beklemesini de kapsar. Aynı instance'ta uçuştaki isteğe katılan çağrı o isteğin
 *   bütçesini paylaşır (en çok `api`).
 * - `subscription`/`rate_limit`/`timezone` yanıttan çıkarılır; kota Sentry'ye BURADAN raporlanır
 *   (her gerçek upstream isteği için bir kez).
 */
import { getRedisClient, withRedis } from '@/lib/redis';
import { reportSportmonksQuota } from '@/services/sportmonks/quotaMonitor';
import { LIVE_TTL, sportmonksCacheTtl } from '@/services/sportmonks/cachePolicy';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3';
// Ortam + şema sürümü öneki (bkz. lib/cacheNamespace.ts): `prod:v2:smc:...` / `prod:v2:smc-lock:...`.
const keyPrefix = () => `${cacheKeyPrefix()}smc:`;
const lockPrefix = () => `${cacheKeyPrefix()}smc-lock:`;
const LOCK_TTL_MS = 10_000;
const LOCK_WAIT_MS = 3_000;
const LOCK_POLL_MS = 150;
/** Upstash istek boyutu sınırının altında kal; daha büyük yanıtlar yalnız L1'de tutulur. */
const MAX_REDIS_BYTES = 900_000;
const L1_MAX_ENTRIES = 300;
const STRIPPED_FIELDS = ['subscription', 'rate_limit', 'timezone'] as const;
const NOT_FOUND_STATUSES = new Set([400, 403, 404, 422]);
const LIVE_CDN_MAX_SECONDS = 15;
const LIVE_CDN_SWR_SECONDS = 5;

/**
 * Upstream zaman aşımı (ms). Sayfa: SSR/ISR render'ı — Sportmonks'un olağan cevabı < 1 sn; 3 sn'de eski veri ya da
 * iskelet göstermek boş beklemekten iyi (Vercel fonksiyonu da CPU değil duvar saati sayar). API: tarayıcı proxy'si,
 * normalize uç noktalar, AI analiz bağlamı, cron/bot — istemci zaten yükleniyor gösteriyor, biraz daha sabır.
 */
export const SPORTMONKS_TIMEOUT_MS = { page: 3_000, api: 5_000 } as const;

export type SportmonksQuery = Record<string, string | string[] | undefined>;

type Entry = { status: number; body: unknown; fetchedAt: number; freshUntil: number; staleUntil: number };

export type CacheOutcome = 'HIT' | 'MISS' | 'STALE' | 'BYPASS';

export type SportmonksCachedResult = {
  status: number;
  body: unknown;
  cache: CacheOutcome;
  /** Taze kalacağı kalan süre (sn) — CDN `s-maxage`. Hata / eski veri → 0. */
  freshForSeconds: number;
  /** Politikadaki taze süre (sn) — `stale-while-revalidate` hesabı için. */
  ttlSeconds: number;
  /** Upstream hata verdi, son geçerli veri döndü. */
  stale: boolean;
};

export type CachedFetchOptions = {
  /** Kota olayında çağrının nereden geldiği (tarayıcı proxy'si mi sunucu mu). */
  origin?: 'proxy' | 'server';
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Bu çağrının bütçesi; verilmezse kapsam (`withSportmonksTimeout`) ya da `SPORTMONKS_TIMEOUT_MS.api`. */
  timeoutMs?: number;
};

// ─── İstek kapsamlı izleme ──────────────────────────────────────────────────

export type SportmonksFetchTracking = {
  /** En az bir cevap upstream hatası yüzünden son geçerli (eski) veriden geldi. */
  stale: boolean;
  /** En az bir istek upstream hatasıyla sonuçlandı ve verecek eski veri yoktu. */
  failed: boolean;
};

type TrackingStore = {
  run: <R>(store: SportmonksFetchTracking, fn: () => R) => R;
  getStore: () => SportmonksFetchTracking | undefined;
};
let trackingStore: TrackingStore | null = null;

/**
 * Tembel `require`: bu modül `sportmonksRuntimeClient`'in dinamik import'u yüzünden istemci chunk grafiğine de
 * giriyor; üst düzey `node:async_hooks` import'u orada derlenmez.
 */
function tracking(): TrackingStore {
  if (!trackingStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    trackingStore = new AsyncLocalStorage<SportmonksFetchTracking>() as unknown as TrackingStore;
  }
  return trackingStore;
}

/**
 * `fn` içindeki tüm Sportmonks çağrılarının (servis katmanı hataları yutsa bile) eski veri / hata
 * durumunu toplar — normalize uç noktalar (`/api/matches/day`) bunu istemciye "veriler gecikmeli"
 * ya da 503 olarak iletir.
 */
export async function trackSportmonksFetches<T>(fn: () => Promise<T>): Promise<{ value: T } & SportmonksFetchTracking> {
  const state: SportmonksFetchTracking = { stale: false, failed: false };
  const value = await tracking().run(state, fn);
  return { value, ...state };
}

// ─── Zaman aşımı kapsamı ───────────────────────────────────────────────────

type TimeoutStore = {
  run: <R>(store: number, fn: () => R) => R;
  getStore: () => number | undefined;
};
let timeoutStore: TimeoutStore | null = null;

function timeoutScope(): TimeoutStore {
  if (!timeoutStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks');
    timeoutStore = new AsyncLocalStorage<number>() as unknown as TimeoutStore;
  }
  return timeoutStore;
}

/** `fn` içindeki tüm Sportmonks çağrılarına `timeoutMs` bütçesi verir (ör. sayfa render'ı → `SPORTMONKS_TIMEOUT_MS.page`). */
export function withSportmonksTimeout<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  return timeoutScope().run(timeoutMs, fn);
}

function resolveTimeoutMs(opts: CachedFetchOptions): number {
  return opts.timeoutMs ?? timeoutScope().getStore() ?? SPORTMONKS_TIMEOUT_MS.api;
}

function noteOutcome(r: SportmonksCachedResult): SportmonksCachedResult {
  const t = tracking().getStore();
  if (t) {
    if (r.stale) t.stale = true;
    if (r.cache === 'BYPASS' && (r.status >= 500 || r.status === 429)) t.failed = true;
  }
  return r;
}

// ─── Anahtar ────────────────────────────────────────────────────────────────

export function normalizeSportmonksPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

export function buildSportmonksCacheKey(path: string, query: SportmonksQuery): string {
  const parts = Object.keys(query)
    .filter((k) => k !== 'path' && k !== 'api_token' && query[k] !== undefined)
    .sort()
    .map((k) => {
      const v = query[k]!;
      return `${k}=${Array.isArray(v) ? [...v].sort().join(',') : v}`;
    });
  return `${keyPrefix()}${normalizeSportmonksPath(path)}?${parts.join('&')}`;
}

// ─── Katmanlar ──────────────────────────────────────────────────────────────

const l1 = new Map<string, Entry>();
const inFlight = new Map<string, Promise<SportmonksCachedResult>>();

function l1Get(key: string, now: number): Entry | null {
  const e = l1.get(key);
  if (!e) return null;
  if (e.freshUntil <= now) {
    l1.delete(key);
    return null;
  }
  return e;
}

function l1Set(key: string, e: Entry): void {
  if (l1.size >= L1_MAX_ENTRIES) {
    const oldest = l1.keys().next().value;
    if (oldest !== undefined) l1.delete(oldest);
  }
  l1.set(key, e);
}

// Redis erişimi `withRedis` üzerinden: zaman aşımı/hata/devre açık → cache yokmuş gibi devam (bkz. lib/redis.ts).
async function redisGet(key: string): Promise<Entry | null> {
  return (await withRedis((r) => r.get<Entry>(key), null)) ?? null;
}

async function redisSet(key: string, e: Entry, now: number): Promise<void> {
  if (JSON.stringify(e.body).length > MAX_REDIS_BYTES) return;
  const ex = Math.max(1, Math.ceil((e.staleUntil - now) / 1000));
  await withRedis((r) => r.set(key, e, { ex }), null);
}

/** Kilit anahtarı veri anahtarından türetilir; önek tekrarlanmaz (`prod:v2:smc-lock:<path?query>`). */
function lockKey(key: string): string {
  return `${lockPrefix()}${key.slice(keyPrefix().length)}`;
}

/** Redis yok / erişilemiyor → kilit alınmış say (fail-open; instance içi tekil uçuş yine geçerli). */
async function tryLock(key: string): Promise<boolean> {
  if (!getRedisClient()) return true;
  return withRedis(async (r) => (await r.set(lockKey(key), 1, { nx: true, px: LOCK_TTL_MS })) === 'OK', true);
}

async function unlock(key: string): Promise<void> {
  await withRedis((r) => r.del(lockKey(key)), 0); // hata olursa kilit PX ile zaten düşer
}

// ─── Upstream ───────────────────────────────────────────────────────────────

export function stripSportmonksMeta(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out = { ...(body as Record<string, unknown>) };
  for (const f of STRIPPED_FIELDS) delete out[f];
  return out;
}

type UpstreamResult = { status: number; body: unknown } | { status: 'network-error' } | { status: 'timeout' };

async function callUpstream(
  path: string,
  query: SportmonksQuery,
  opts: CachedFetchOptions,
  timeoutMs: number,
): Promise<UpstreamResult> {
  const apiToken = process.env.SPORTMONKS_API_KEY;
  if (!apiToken) throw new Error('Missing SPORTMONKS_API_KEY (sunucu ortam değişkeni tanımlı değil)');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k === 'path' || k === 'api_token' || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
    else qs.append(k, v);
  }
  qs.set('api_token', apiToken);

  let res: Response;
  let raw: unknown;
  // Zaman aşımı gövde okumayı da kapsar (sinyal yanıt akışını da keser).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // SPORTMONKS_UPSTREAM_BASE: yalnızca yük/kabul script'i için sahte upstream (scripts/load/simulate-visitors.mjs).
    const base = process.env.SPORTMONKS_UPSTREAM_BASE || SPORTMONKS_BASE;
    res = await (opts.fetchImpl ?? fetch)(`${base}/${path}?${qs.toString()}`, { signal: controller.signal });
    raw = await res.json().catch(() => null);
  } catch {
    return { status: controller.signal.aborted ? 'timeout' : 'network-error' };
  } finally {
    clearTimeout(timer);
  }
  if (controller.signal.aborted) return { status: 'timeout' };

  const rl = (raw as { rate_limit?: { requested_entity: string; remaining: number; resets_in_seconds: number } } | null)
    ?.rate_limit;
  if (rl) {
    reportSportmonksQuota({
      pool: rl.requested_entity,
      remaining: rl.remaining,
      resetsInSeconds: rl.resets_in_seconds,
      path: `/${path}`,
      ...(opts.origin ? { origin: opts.origin } : {}),
    });
  }
  return { status: res.status, body: stripSportmonksMeta(raw) };
}

/** Cache'lenebilir mi: gerçek veri (200 + data) ya da kalıcı "yok" (404/403/422/400, boş 200). */
function isCacheable(status: number, body: unknown): boolean {
  if (NOT_FOUND_STATUSES.has(status)) return true;
  return status === 200 && body != null && typeof body === 'object';
}

function dataOf(body: unknown): unknown {
  return body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined;
}

function toResult(e: Entry, cache: CacheOutcome, now: number, stale = false): SportmonksCachedResult {
  return {
    status: e.status,
    body: e.body,
    cache,
    freshForSeconds: stale ? 0 : Math.max(0, Math.floor((e.freshUntil - now) / 1000)),
    ttlSeconds: Math.max(1, Math.round((e.freshUntil - e.fetchedAt) / 1000)),
    stale,
  };
}

async function refresh(
  key: string,
  path: string,
  query: SportmonksQuery,
  previous: Entry | null,
  opts: CachedFetchOptions,
  timeoutMs: number,
): Promise<SportmonksCachedResult> {
  const now = opts.now ?? Date.now;
  const startedAt = now();

  const locked = await tryLock(key);
  if (!locked) {
    // Başka bir instance tazeliyor: eski veri varsa hemen onu ver, yoksa yazmasını bekle (bütçe içinde).
    if (previous) return toResult(previous, 'STALE', now(), true);
    const deadline = now() + Math.min(LOCK_WAIT_MS, timeoutMs);
    while (now() < deadline) {
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
      const e = await redisGet(key);
      if (e && e.freshUntil > now()) {
        l1Set(key, e);
        return toResult(e, 'HIT', now());
      }
    }
    // Kilit sahibi yazamadı (hata/timeout) → kalan bütçeyle kendimiz dene (fail-open).
  }

  try {
    const remainingMs = timeoutMs - (now() - startedAt);
    const up: UpstreamResult = remainingMs > 0 ? await callUpstream(path, query, opts, remainingMs) : { status: 'timeout' };
    const t = now();
    if (typeof up.status === 'number' && 'body' in up && isCacheable(up.status, up.body)) {
      const ttl = sportmonksCacheTtl(path, up.status === 200 ? dataOf(up.body) : undefined, t, query);
      const entry: Entry = {
        status: up.status,
        body: up.body,
        fetchedAt: t,
        freshUntil: t + ttl.fresh * 1000,
        staleUntil: t + Math.max(ttl.fresh, ttl.stale) * 1000,
      };
      l1Set(key, entry);
      await redisSet(key, entry, t);
      return toResult(entry, 'MISS', t);
    }
    // 429 / 5xx / ağ hatası / zaman aşımı → son geçerli veri
    if (previous && previous.staleUntil > t) return toResult(previous, 'STALE', t, true);
    if (up.status === 'network-error') {
      return { status: 502, body: { message: 'Sportmonks erişilemiyor' }, cache: 'BYPASS', freshForSeconds: 0, ttlSeconds: 0, stale: false };
    }
    if (up.status === 'timeout') {
      return { status: 504, body: { message: 'Sportmonks zaman aşımı' }, cache: 'BYPASS', freshForSeconds: 0, ttlSeconds: 0, stale: false };
    }
    return { status: up.status, body: up.body, cache: 'BYPASS', freshForSeconds: 0, ttlSeconds: 0, stale: false };
  } finally {
    if (locked) await unlock(key);
  }
}

/**
 * Sportmonks GET — paylaşımlı cache'ten ya da (gerekirse, tek seferde) upstream'den.
 * @param path `football/fixtures/date/2026-09-30` biçiminde (`/v3/` sonrası)
 */
export async function fetchSportmonksCached(
  path: string,
  query: SportmonksQuery,
  opts: CachedFetchOptions = {},
): Promise<SportmonksCachedResult> {
  const now = opts.now ?? Date.now;
  const normPath = normalizeSportmonksPath(path);
  const key = buildSportmonksCacheKey(normPath, query);
  const timeoutMs = resolveTimeoutMs(opts);

  const hot = l1Get(key, now());
  if (hot) return toResult(hot, 'HIT', now());

  const pending = inFlight.get(key);
  if (pending) return noteOutcome(await pending);

  const promise = (async () => {
    const stored = await redisGet(key);
    const t = now();
    if (stored && stored.freshUntil > t) {
      l1Set(key, stored);
      return toResult(stored, 'HIT', t);
    }
    return refresh(key, normPath, query, stored && stored.staleUntil > t ? stored : null, opts, timeoutMs);
  })();

  inFlight.set(key, promise);
  try {
    return noteOutcome(await promise);
  } finally {
    inFlight.delete(key);
  }
}

/**
 * CDN başlığı: taze kalan süre kadar `s-maxage`, ardından 3×TTL `stale-while-revalidate`
 * (edge eski kopyayı verirken arkada tazeler). Eski veri (upstream hatası) kısa cache'lenir;
 * hata cevapları hiç cache'lenmez. Canlı veri (TTL ≤ LIVE_TTL: inplay, canlı tekil maç) CDN'de en çok
 * 15 + 5 sn — eski kopya 20 sn'den yaşlı verilmesin.
 */
export function sportmonksCacheControl(r: SportmonksCachedResult): string {
  if (r.stale) return 'public, s-maxage=15, stale-while-revalidate=60';
  if (r.cache === 'BYPASS' || r.freshForSeconds <= 0) return 'no-store';
  if (r.ttlSeconds <= LIVE_TTL) {
    return `public, s-maxage=${Math.min(r.freshForSeconds, LIVE_CDN_MAX_SECONDS)}, stale-while-revalidate=${LIVE_CDN_SWR_SECONDS}`;
  }
  const swr = Math.max(30, r.ttlSeconds * 3);
  return `public, s-maxage=${r.freshForSeconds}, stale-while-revalidate=${swr}`;
}

/** Test yardımcısı — instance içi durumu sıfırlar. */
export function resetSportmonksCacheForTests(): void {
  l1.clear();
  inFlight.clear();
}
