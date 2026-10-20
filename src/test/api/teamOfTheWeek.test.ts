import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/server/teamOfTheWeek', () => ({ loadTeamOfTheWeek: h.load }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: true, resetAt: Date.now() }),
  requestIp: () => '1.1.1.1',
}));

import handler from '@/pages/api/leagues/[id]/team-of-the-week';

async function call(id: string, method = 'GET') {
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
  await handler({ method, query: { id }, headers: {}, socket: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return { res, headers };
}

describe('GET /api/leagues/{id}/team-of-the-week', () => {
  beforeEach(() => {
    h.load.mockReset();
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('veri var: 200, CDN 1 sa + 12 sa swr', async () => {
    h.load.mockResolvedValue({ leagueId: 600, formation: '4-4-2', round: {}, players: [] });
    const { res, headers } = await call('600');
    expect(res.statusCode).toBe(200);
    expect(h.load).toHaveBeenCalledWith(600);
    expect(headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=43200');
  });

  it('ligde yok: 404, kısa CDN', async () => {
    h.load.mockResolvedValue(null);
    const { res, headers } = await call('564');
    expect(res.statusCode).toBe(404);
    expect(headers['Cache-Control']).toContain('s-maxage=3600');
  });

  it('hata ≠ veri yok: Sportmonks hatası 502 + no-store', async () => {
    h.load.mockRejectedValue(new Error('timeout'));
    const { res, headers } = await call('600');
    expect(res.statusCode).toBe(502);
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('plan dışı / geçersiz lig: yükleyici çağrılmaz', async () => {
    for (const id of ['999999', 'abc', '-600', '600.5', '']) {
      const { res } = await call(id);
      expect(res.statusCode).toBe(404);
    }
    expect(h.load).not.toHaveBeenCalled();
  });

  it('GET dışı 405', async () => {
    const { res } = await call('600', 'POST');
    expect(res.statusCode).toBe(405);
  });
});
