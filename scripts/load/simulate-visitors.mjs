#!/usr/bin/env node
/**
 * Kabul script'i: 1 ziyaretçi ile N eşzamanlı ziyaretçi arasında Sportmonks'a giden upstream istek sayısı
 * (path başına) neredeyse aynı kalmalı.
 *
 * Kendi kendine yeterli: sayaçlı sahte bir Sportmonks sunucusu açar, her tur için build edilmiş uygulamayı
 * (`next start`) SPORTMONKS_UPSTREAM_BASE ile ona yönlendirerek yeniden başlatır (cache'ler sıfırdan),
 * ziyaretçileri GERÇEK zamanda çalıştırır ve tabloyu basar. Redis kapalı (prod Redis'e yazılmaz).
 *
 * Kullanım (önce: NEXT_DIST_DIR=.next-quota npx next build):
 *   node scripts/load/simulate-visitors.mjs [--visitors 1,20] [--minutes 10] [--scenario quiet|live] [--dist .next-quota]
 *
 * Ziyaretçi davranışı (ana sayfa, C sonrası): ilk yüklemede /api/matches/day + yan panel (proxy); cevaptaki
 * maçlara göre 30 sn (canlı/±15 dk) ya da 5 dk'da bir /api/matches/day; 3. dakikada bir maç detayı
 * (SSR + proxy istekleri). Ziyaretçiler ilk dakikaya yayılarak gelir.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const VISITOR_RUNS = String(args.visitors ?? '1,20').split(',').map(Number);
const MINUTES = Number(args.minutes ?? 10);
const SCENARIO = args.scenario === 'live' ? 'live' : 'quiet';
const DIST = args.dist ?? '.next-quota';
const STUB_PORT = 4599;
const APP_PORT = 3119;
const APP = `http://127.0.0.1:${APP_PORT}`;

// ─── Sahte Sportmonks ────────────────────────────────────────────────────────
const counts = new Map();
const iso = (d) => d.toISOString().slice(0, 10);
const sm = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

function respond(path, page) {
  const now = new Date();
  // Ziyaretçiler Türkiye gününü ister (ana sayfanın tarih şeridi) — sahte upstream'in "bugün"ü de o gün olmalı.
  const today = iso(new Date(now.getTime() + 3 * 3600e3));
  const evening = { id: 19746594, league_id: 600, state_id: 1, starting_at: sm(new Date(now.getTime() + 6 * 3600e3)) };
  const live = { id: 19746001, league_id: 600, state_id: 2, starting_at: sm(new Date(now.getTime() - 30 * 60e3)) };
  const rate = { rate_limit: { resets_in_seconds: 3000, remaining: 2000, requested_entity: 'Fixture' } };
  const list = (data, hasMore = false) => ({ data, pagination: { has_more: hasMore }, ...rate });
  if (path.startsWith('football/livescores/')) return SCENARIO === 'live' ? list([live]) : { message: 'No result(s) found', ...rate };
  if (path === `football/fixtures/date/${today}` || path.startsWith(`football/fixtures/between/${today}`)) {
    return list(SCENARIO === 'live' ? [live, evening] : [evening]);
  }
  // Diğer günler (ör. Türkiye günü için çekilen önceki UTC günü): bitmiş maçlar.
  if (path.startsWith('football/fixtures/date/')) return list([{ id: 9, league_id: 600, state_id: 5, starting_at: '2026-01-01 18:00:00' }]);
  if (/^football\/fixtures\/\d+$/.test(path)) return { data: evening, ...rate };
  if (path.startsWith('football/fixtures/')) return list([{ id: 1, league_id: 600, state_id: 5, starting_at: '2026-08-01 17:00:00' }]);
  if (path.startsWith('football/topscorers/')) return list([], page < 4);
  if (path.startsWith('football/leagues/')) return { data: { id: 600, seasons: [{ id: 28203, is_current: true }] }, ...rate };
  return list([]);
}

const stub = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://stub');
  const path = u.pathname.replace(/^\/v3\//, '');
  const page = Number(u.searchParams.get('page') ?? '1');
  const key = page > 1 ? `${path} (sayfa ${page})` : path;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(respond(path, page)));
});

// ─── Uygulama ────────────────────────────────────────────────────────────────
async function startApp() {
  const child = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
    env: {
      ...process.env,
      NEXT_DIST_DIR: DIST,
      SPORTMONKS_UPSTREAM_BASE: `http://127.0.0.1:${STUB_PORT}/v3`,
      SPORTMONKS_API_KEY: 'stub',
      NEXT_PUBLIC_SPORTMONKS_ENABLED: 'true',
      // Boş değer → getRedisClient() null (prod Redis'e yazılmaz; `??` boş string'i geçmez).
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${APP}/robots.txt`)).ok) return child;
    } catch {
      /* henüz açılmadı */
    }
    await sleep(500);
  }
  child.kill();
  throw new Error('next start açılmadı');
}

// ─── Ziyaretçi ───────────────────────────────────────────────────────────────
const INC = encodeURIComponent('participants;scores;state;periods;league.country;venue;referees.referee;round;stage;group');
const SIDEBAR = [
  'football/leagues/600?include=seasons',
  'football/leagues/600?include=seasons',
  `football/standings/seasons/28203?include=${encodeURIComponent('participant;details.type')}&per_page=50&page=1`,
  ...[1, 2, 3, 4].map((p) => `football/topscorers/seasons/28203?include=player%3Bparticipant&filters=seasonTopscorerTypes%3A208&per_page=50&page=${p}`),
];
const MATCH = (id, today, from89) => [
  `football/fixtures/${id}?include=${INC}%3Bevents`,
  `football/fixtures/${id}?include=statistics`,
  `football/fixtures/${id}?include=${encodeURIComponent('lineups.player.nationality;lineups.details;participants')}`,
  `football/fixtures/head-to-head/34/88?include=${INC}`,
  `football/fixtures/between/${from89}/${today}/34?include=${INC}&per_page=50&page=1`,
  `football/fixtures/between/${from89}/${today}/88?include=${INC}&per_page=50&page=1`,
];

function active(body) {
  const now = Date.now();
  return [...(body.liveMatches ?? []), ...(body.fixtureMatches ?? [])].some((m) => {
    if (m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK') return true;
    if (m.status !== 'NOT STARTED' || !m.date || !m.scheduled) return false;
    const d = Date.parse(`${m.date}T${m.scheduled}:00Z`) - now;
    return Math.abs(d) <= 15 * 60e3 || (d < 0 && d > -3 * 3600e3);
  });
}

async function get(path, ip) {
  // Tarayıcı proxy'ye token göndermez (api_token yok; token sunucuda `Authorization` başlığıyla eklenir).
  const url = path.startsWith('/') ? `${APP}${path}` : `${APP}/api/sportmonks/${path}`;
  const res = await fetch(url, { headers: { 'x-forwarded-for': ip } });
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

async function visitor(i, n, endAt) {
  await sleep(Math.floor((i * 60_000) / Math.max(1, n)));
  const ip = `10.1.0.${i + 1}`;
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Türkiye günü
  const from89 = iso(new Date(Date.now() - 89 * 86400e3));
  const start = Date.now();
  let body = await get(`/api/matches/day?date=${today}`, ip);
  await Promise.all(SIDEBAR.map((p) => get(p, ip)));
  let matchDone = false;
  while (Date.now() < endAt) {
    const wait = active(body) ? 30_000 : 300_000;
    const next = Math.min(endAt, Date.now() + wait);
    // 3. dakikada maç detayı (SSR + istemci)
    if (!matchDone && start + 180_000 < next) {
      await sleep(Math.max(0, start + 180_000 - Date.now()));
      await Promise.all([get('/matches/19746594', ip), ...MATCH(19746594, iso(new Date()), from89).map((p) => get(p, ip))]);
      matchDone = true;
    }
    await sleep(Math.max(0, next - Date.now()));
    if (Date.now() >= endAt) break;
    body = await get(`/api/matches/day?date=${today}`, ip);
  }
}

async function run(n) {
  counts.clear();
  const app = await startApp();
  try {
    const endAt = Date.now() + MINUTES * 60_000;
    await Promise.all(Array.from({ length: n }, (_, i) => visitor(i, n, endAt)));
  } finally {
    app.kill();
    await sleep(1000);
  }
  return new Map(counts);
}

await new Promise((r) => stub.listen(STUB_PORT, r));
const results = [];
for (const n of VISITOR_RUNS) {
  process.stderr.write(`${n} ziyaretçi, ${MINUTES} dk (${SCENARIO})…\n`);
  results.push([n, await run(n)]);
}
stub.close();

const keys = [...new Set(results.flatMap(([, m]) => [...m.keys()]))].sort();
const fixture = (m) => [...m.entries()].filter(([k]) => /^football\/(fixtures|livescores)\//.test(k)).reduce((a, [, v]) => a + v, 0);
console.log(`\nSenaryo: ${SCENARIO}, ${MINUTES} dk — Sportmonks'a giden upstream istekleri\n`);
console.log(results.map(([n]) => `${String(n).padStart(4)} z.`).join(' |') + ' | path');
for (const k of keys) console.log(results.map(([, m]) => String(m.get(k) ?? 0).padStart(7)).join(' |') + ` | ${k}`);
console.log(results.map(([, m]) => String(fixture(m)).padStart(7)).join(' |') + ' | Fixture havuzu toplam');
