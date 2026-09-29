/**
 * Kabul senaryosu (vitest'ten sürülür): N ziyaretçi 10 dk boyunca siteyi gezer; Sportmonks'a giden
 * GERÇEK upstream istekleri path başına sayılır. Ziyaretçiler ilk dakikaya yayılarak gelir.
 *
 * Her ziyaretçi: ana sayfa ilk yükleme + görünür kaldıkça polling (tarayıcı → proxy), 3. dakikada bir
 * maç detayı (SSR sunucu yolu + tarayıcı → proxy).
 *
 * İstek kalıbı `pattern` ile verilir. `football/...` istekleri Sportmonks proxy'sine, `api/...` istekleri
 * `apiHandlers`'taki normalize uç noktalara (ör. `/api/matches/day`) gider.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export type VisitorPattern = {
  /** Ana sayfa ilk yüklemede tarayıcının proxy'ye attığı istekler (path?query, `football/...`). */
  homeInitial: (today: string) => string[];
  /** Ana sayfa polling'i: aralık (sn) ve her turdaki istekler. */
  homePollSeconds: number;
  homePoll: (today: string) => string[];
  /** Maç detayı: SSR'ın sunucudan yaptığı istekler + tarayıcının proxy'ye attıkları. */
  matchSsr: (matchId: string) => { path: string; params: Record<string, string> }[];
  matchClient: (matchId: string, today: string, from89: string) => string[];
};

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

export type SimulationDeps = {
  proxyHandler: Handler;
  /** `api/matches/day` → handler (query string hariç path). */
  apiHandlers?: Record<string, Handler>;
  serverRequest: (path: string, params: Record<string, string>) => Promise<unknown>;
  setNow: (ms: number) => void;
};

export type SimulationResult = {
  /** Sportmonks'a giden gerçek upstream istekleri (path başına). */
  byPath: Record<string, number>;
  total: number;
  fixturePool: number;
  /** Proxy'ye + sunucu yoluna GELEN istekler — cache olmasaydı upstream'e gidecek olanlar. */
  incoming: number;
  incomingFixturePool: number;
};

function fakeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
}

const FIXTURE_POOL = /^football\/(fixtures|livescores)\//;

async function proxyGet(deps: SimulationDeps, pathAndQuery: string, ip: string, seen: string[]) {
  const [path, qs = ''] = pathAndQuery.split('?');
  seen.push(path!);
  const api = path!.startsWith('api/');
  const query: Record<string, string | string[]> = api ? {} : { path: path!.split('/') };
  new URLSearchParams(qs).forEach((v, k) => (query[k] = v));
  const req = { method: 'GET', query, headers: { 'x-forwarded-for': ip }, socket: {} } as unknown as NextApiRequest;
  const handler = api ? deps.apiHandlers?.[path!] : deps.proxyHandler;
  if (!handler) throw new Error(`Simülasyonda handler yok: ${path}`);
  await handler(req, fakeRes() as unknown as NextApiResponse);
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Upstream isteği sayacı — `fetch` mock'u her gerçek Sportmonks çağrısında bunu çağırır. */
export function createUpstreamCounter() {
  const byPath: Record<string, number> = {};
  return {
    byPath,
    record(url: string) {
      const u = new URL(url);
      const path = u.pathname.replace(/^\/v3\//, '');
      const page = u.searchParams.get('page');
      const key = page && page !== '1' ? `${path} (sayfa ${page})` : path;
      byPath[key] = (byPath[key] ?? 0) + 1;
    },
  };
}

export async function simulateVisitors(
  visitors: number,
  pattern: VisitorPattern,
  deps: SimulationDeps,
  counter: ReturnType<typeof createUpstreamCounter>,
  opts: { start: number; durationSeconds?: number; matchId?: string },
): Promise<SimulationResult> {
  const duration = opts.durationSeconds ?? 600;
  const matchId = opts.matchId ?? '19746594';
  const today = iso(opts.start);
  const from89 = iso(opts.start - 89 * 86_400_000);
  // Ziyaretçiler ilk dakikaya yayılır (aynı saniyeye düşenler eşzamanlı).
  const seen: string[] = [];
  const arrival = Array.from({ length: visitors }, (_, i) => Math.floor((i * 60) / Math.max(1, visitors)));

  for (let s = 0; s < duration; s += 1) {
    deps.setNow(opts.start + s * 1000);
    const work: Promise<unknown>[] = [];
    arrival.forEach((t0, i) => {
      const ip = `10.0.0.${i + 1}`;
      const since = s - t0;
      if (since < 0) return;
      if (since === 0) pattern.homeInitial(today).forEach((p) => work.push(proxyGet(deps, p, ip, seen)));
      else if (since % pattern.homePollSeconds === 0) pattern.homePoll(today).forEach((p) => work.push(proxyGet(deps, p, ip, seen)));
      if (since === 180) {
        pattern.matchSsr(matchId).forEach((c) => {
          seen.push(`football${c.path}`);
          work.push(deps.serverRequest(c.path, c.params));
        });
        pattern.matchClient(matchId, today, from89).forEach((p) => work.push(proxyGet(deps, p, ip, seen)));
      }
    });
    await Promise.all(work);
  }

  const byPath = { ...counter.byPath };
  const total = Object.values(byPath).reduce((a, b) => a + b, 0);
  const fixturePool = Object.entries(byPath)
    .filter(([k]) => FIXTURE_POOL.test(k))
    .reduce((a, [, v]) => a + v, 0);
  return {
    byPath,
    total,
    fixturePool,
    incoming: seen.length,
    incomingFixturePool: seen.filter((k) => FIXTURE_POOL.test(k)).length,
  };
}
