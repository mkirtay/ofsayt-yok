import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ allowed: true }));
vi.mock('@/lib/requireComboAccess', () => ({
  requireComboAccess: vi.fn(async (_r: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => {
    if (h.allowed) return { ok: true, userId: 'a' };
    res.status(404).json({ error: 'Not found' });
    return { ok: false };
  }),
}));
const load = vi.hoisted(() => vi.fn());
vi.mock('@/server/combo/matchOdds', () => ({ loadNationalMatchOdds: load }));

import handler from '@/pages/api/combo/match-odds';

function call(query: Record<string, string>, method = 'GET') {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
  };
  return handler({ method, query } as unknown as NextApiRequest, res as unknown as NextApiResponse).then(() => res);
}

describe('/api/combo/match-odds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    load.mockReset();
    h.allowed = true;
  });

  it('milli maç bayrağı kapalı → 404, yükleme yok', async () => {
    expect((await call({ id: '2001528905' })).statusCode).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });

  it('yetkisiz → kapıdan 404, yükleme yok', async () => {
    vi.stubEnv('NATIONAL_MATCHES_ENABLED', '1');
    h.allowed = false;
    expect((await call({ id: '2001528905' })).statusCode).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });

  it('yetkili: oran döner (tek yükleme), noindex + önbelleksiz; veri yok → odds null', async () => {
    vi.stubEnv('NATIONAL_MATCHES_ENABLED', '1');
    load.mockResolvedValue({ ok: true, odds: null });
    const r = await call({ id: '2001528905' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ odds: null });
    expect(load).toHaveBeenCalledTimes(1);
    expect(r.headers['cache-control']).toBe('private, no-store');
  });

  it('lig maçı id → 404; AF hatası → 502; POST → 405', async () => {
    vi.stubEnv('NATIONAL_MATCHES_ENABLED', '1');
    load.mockResolvedValueOnce({ ok: false, reason: 'not-national' });
    expect((await call({ id: '19172147' })).statusCode).toBe(404);
    load.mockResolvedValueOnce({ ok: false, reason: 'error' });
    expect((await call({ id: '2001528905' })).statusCode).toBe(502);
    expect((await call({ id: '2001528905' }, 'POST')).statusCode).toBe(405);
  });
});
