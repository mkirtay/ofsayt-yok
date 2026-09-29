import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/lib/redis', () => ({ getRedisClient: () => null }));
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
