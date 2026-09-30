#!/usr/bin/env node
/**
 * Redis kesintisinde istek süresi ölçümü. Build edilmiş uygulamayı (`next start`) sahte bir Sportmonks'a
 * yönlendirip Redis'i üç şekilde verir ve ardışık, her biri cache MISS olan proxy isteklerinin süresini ölçer:
 *   --redis off        Redis tanımsız (taban çizgisi)
 *   --redis blackhole  Redis adresi cevap vermiyor (bağlantı asılı kalır — gerçek kesinti)
 *   --redis refused    Redis adresi bağlantıyı hemen reddediyor
 * Kullanım: node scripts/load/redis-outage-bench.mjs --redis blackhole [--requests 20] [--dist .next-quota] [--port 3131]
 * Prod Redis'e dokunmaz; SPORTMONKS_UPSTREAM_BASE sahte upstream'e bağlar.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const MODE = args.redis ?? 'blackhole';
const N = Number(args.requests ?? 20);
const DIST = args.dist ?? '.next-quota';
const PORT = Number(args.port ?? 3131);
const STUB_PORT = PORT + 1000;
const REDIS_URL = { off: '', blackhole: 'https://10.255.255.1', refused: 'http://127.0.0.1:9' }[MODE];
if (REDIS_URL === undefined) throw new Error(`--redis off|blackhole|refused (verilen: ${MODE})`);

const stub = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ data: { id: 1, name: 'x' }, rate_limit: { resets_in_seconds: 100, remaining: 2000, requested_entity: 'League' } }));
});
await new Promise((r) => stub.listen(STUB_PORT, r));

const app = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env,
    NEXT_DIST_DIR: DIST,
    SPORTMONKS_UPSTREAM_BASE: `http://127.0.0.1:${STUB_PORT}/v3`,
    SPORTMONKS_API_KEY: 'stub',
    UPSTASH_REDIS_REST_URL: REDIS_URL,
    UPSTASH_REDIS_REST_TOKEN: REDIS_URL ? 'bench' : '',
  },
  stdio: 'ignore',
});
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${base}/robots.txt`)).ok) break;
  } catch {
    /* açılıyor */
  }
  await sleep(500);
}

const times = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  // Her istek farklı anahtar → cache MISS: rate limit + Redis get + kilit + set + del yolunun tamamı.
  const res = await fetch(`${base}/api/sportmonks/football/leagues/${1000 + i}?api_token=`, { headers: { 'x-forwarded-for': '10.9.9.9' } });
  await res.arrayBuffer();
  times.push(Math.round(performance.now() - t0));
}
app.kill();
stub.close();

const sorted = [...times].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
console.log(`Redis: ${MODE} (${REDIS_URL || 'tanımsız'}), ${N} ardışık MISS isteği, build: ${DIST}`);
console.log(`süreler (ms): ${times.join(' ')}`);
console.log(`medyan ${pct(50)} ms | p95 ${pct(95)} ms | en uzun ${sorted.at(-1)} ms | toplam ${times.reduce((a, b) => a + b, 0)} ms`);
