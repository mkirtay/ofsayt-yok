/** Ortak: AF (Redis'siz, diskte önbellekli, dakika sınırına saygılı) — backtest ve gün analizi betikleri. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AfGet } from '../../src/server/analysisNationalContext';

const i = process.argv.indexOf('--cache');
const CACHE = i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : join(process.env.TMPDIR ?? '/tmp', 'milli-backtest-cache');
mkdirSync(CACHE, { recursive: true });
export const afStats = { requests: 0, cacheHits: 0 };

let lastCall = 0;
const MIN_GAP_MS = 350; // ~170/dk: Pro dakika sınırının altında
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let chain: Promise<unknown> = Promise.resolve();
const throttle = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
};

export const afGet: AfGet = async <T>(path: string, params: Record<string, string | number>) => {
  const key = createHash('sha1').update(path + JSON.stringify(Object.entries(params).sort())).digest('hex');
  const file = join(CACHE, `${key}.json`);
  if (existsSync(file)) {
    afStats.cacheHits++;
    return JSON.parse(readFileSync(file, 'utf8')) as { response: T[] };
  }
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error('API_FOOTBALL_KEY yok');
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  for (let attempt = 0; ; attempt++) {
    const res = await throttle(() => {
      afStats.requests++;
      return fetch(`https://v3.football.api-sports.io${path}?${qs}`, { headers: { 'x-apisports-key': apiKey }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    });
    if (res?.ok) {
      const body = (await res.json()) as { response: T[]; errors?: unknown };
      const errs = body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors as object).length);
      if (errs && /rateLimit/i.test(JSON.stringify(body.errors)) && attempt < 6) { await sleep(20_000); continue; }
      if (errs) throw new Error(`AF hata: ${JSON.stringify(body.errors).slice(0, 150)}`);
      writeFileSync(file, JSON.stringify(body));
      return body;
    }
    if (attempt >= 3) throw new Error(`AF ${path} başarısız (${res?.status ?? 'ağ'})`);
    await sleep(1500 * (attempt + 1));
  }
};
