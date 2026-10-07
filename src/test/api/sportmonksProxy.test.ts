import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/lib/redis', () => ({ getRedisClient: () => null, withRedis: async (_fn: unknown, fallback: unknown) => fallback }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: true, remaining: 99, resetAt: 0 }),
  requestIp: () => '10.0.0.1',
}));
vi.mock('@/services/sportmonks/quotaMonitor', () => ({ reportSportmonksQuota: vi.fn() }));

const ORIGINAL_TOKEN = process.env.SPORTMONKS_API_KEY;

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, path: string[], query: Record<string, string> = {}) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  const req = { method: 'GET', query: { path, api_token: '', ...query }, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

describe('/api/sportmonks proxy', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SPORTMONKS_API_KEY = 'test-token';
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({
          data: { id: 600, name: 'Super Lig' },
          subscription: [{ plans: [{ plan: 'Growth' }] }],
          rate_limit: { resets_in_seconds: 100, remaining: 2400, requested_entity: 'League' },
          timezone: 'UTC',
        }),
        { status: 200 },
      ),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_TOKEN === undefined) delete process.env.SPORTMONKS_API_KEY;
    else process.env.SPORTMONKS_API_KEY = ORIGINAL_TOKEN;
  });

  it('subscription/rate_limit/timezone tarayıcıya gitmez; CDN başlığı ve X-Cache set edilir', async () => {
    const handler = (await import('@/pages/api/sportmonks/[...path]')).default;
    const first = await call(handler, ['football', 'leagues', '600'], { include: 'seasons' });
    const second = await call(handler, ['football', 'leagues', '600'], { include: 'seasons' });

    expect(first.body).toEqual({ data: { id: 600, name: 'Super Lig' } });
    expect(first.headers['Cache-Control']).toMatch(/^public, s-maxage=86400, stale-while-revalidate=\d+$/);
    expect(first.headers['X-Cache']).toBe('MISS');
    expect(second.headers['X-Cache']).toBe('HIT');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('GET dışı metot 405', async () => {
    const handler = (await import('@/pages/api/sportmonks/[...path]')).default;
    const res = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, json() { return this; }, setHeader() {} };
    await handler({ method: 'POST', query: {}, headers: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.statusCode).toBe(405);
  });
});

describe('/api/sportmonks proxy — izin listesi modları', () => {
  const ORIGINAL_MODE = process.env.SPORTMONKS_ALLOWLIST_MODE;
  beforeEach(() => {
    vi.resetModules();
    process.env.SPORTMONKS_API_KEY = 'test-token';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_MODE === undefined) delete process.env.SPORTMONKS_ALLOWLIST_MODE;
    else process.env.SPORTMONKS_ALLOWLIST_MODE = ORIGINAL_MODE;
  });

  it('varsayılan mod enforce (2026-10-04): listede olmayan istek 403, upstream\'e gitmez, loglanır', async () => {
    delete process.env.SPORTMONKS_ALLOWLIST_MODE;
    const handler = (await import('@/pages/api/sportmonks/[...path]')).default;
    const res = await call(handler, ['football', 'odds', 'pre-match'], { include: 'bookmaker' });
    expect(res.statusCode).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('sportmonks_allowlist_miss'));
  });

  it('log modu (açıkça): listede olmayan istek ENGELLENMEZ, loglanır', async () => {
    process.env.SPORTMONKS_ALLOWLIST_MODE = 'log';
    const handler = (await import('@/pages/api/sportmonks/[...path]')).default;
    const res = await call(handler, ['football', 'odds', 'pre-match'], { include: 'bookmaker' });
    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('sportmonks_allowlist_miss'));
  });

  it.each(['log', 'off'])('güvensiz yol / dizi parametre her modda 400 (%s)', async (mode) => {
    process.env.SPORTMONKS_ALLOWLIST_MODE = mode;
    const handler = (await import('@/pages/api/sportmonks/[...path]')).default;
    const inject = await call(handler, ['football', 'teams', 'search', 'x?include=odds&per_page=500']);
    expect(inject.statusCode).toBe(400);
    const res = { ...(await call(handler, ['football', 'teams', '34'])) };
    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('upstream\'e yalnız bilinen parametreler gider (api_token / bilinmeyenler atılır)', async () => {
    const handler = (await import('@/pages/api/sportmonks/[...path]')).default;
    await call(handler, ['football', 'teams', '34'], { include: 'seasons', junk: 'x' });
    const [input, init] = vi.mocked(global.fetch).mock.calls[0]!;
    const url = new URL(String(input));
    expect([...url.searchParams.keys()].sort()).toEqual(['include']);
    // token URL'de değil, Authorization başlığında (güvenlik raporu Y1)
    expect(new Headers(init?.headers).get('authorization')).toBe('test-token');
  });

  it('enforce modu: 403, upstream\'e gitmez', async () => {
    process.env.SPORTMONKS_ALLOWLIST_MODE = 'enforce';
    const handler = (await import('@/pages/api/sportmonks/[...path]')).default;
    const res = await call(handler, ['football', 'odds', 'pre-match']);
    expect(res.statusCode).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
