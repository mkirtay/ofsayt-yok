import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/server/turkeyTeamTiers', () => ({ loadTurkeyTeamTiers: h.load }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: true, resetAt: Date.now() }),
  requestIp: () => '1.1.1.1',
}));

import handler from '@/pages/api/leagues/turkey-team-tiers';

async function call() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
  };
  await handler({ method: 'GET', headers: {}, socket: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return { res, headers };
}

describe('GET /api/leagues/turkey-team-tiers — önbellek süreleri', () => {
  beforeEach(() => {
    h.load.mockReset();
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('tam harita: CDN 24 saat', async () => {
    h.load.mockResolvedValue({ payload: { tiers: { '1': 600 }, validFrom: '2026-07-01' }, complete: true });
    const { res, headers } = await call();
    expect(res.statusCode).toBe(200);
    expect(headers['Cache-Control']).toContain('s-maxage=86400');
  });

  it('eksik lig: kısa cache (5 dk) — kendini toparlasın', async () => {
    h.load.mockResolvedValue({ payload: { tiers: { '1': 600 } }, complete: false });
    const { headers } = await call();
    expect(headers['Cache-Control']).toContain('s-maxage=300');
  });

  it('boş harita: 503 + no-store (boş sonuç 24 saat kalmaz)', async () => {
    h.load.mockResolvedValue({ payload: { tiers: {} }, complete: false });
    const { res, headers } = await call();
    expect(res.statusCode).toBe(503);
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('Sportmonks kapalıyken yükleyiciyi çağırmadan boş harita', async () => {
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'false');
    const { res } = await call();
    expect(res.body).toEqual({ tiers: {} });
    expect(h.load).not.toHaveBeenCalled();
  });
});
