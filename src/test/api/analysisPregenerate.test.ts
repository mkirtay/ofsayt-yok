import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ adminOk: false, runs: [] as Array<{ dryRun?: boolean }> }));
vi.mock('@/lib/requireAuth', () => ({
  requireAdmin: vi.fn(async (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => {
    if (h.adminOk) return { ok: true, userId: 'admin' };
    res.status(403).json({ error: 'yetkisiz' });
    return { ok: false };
  }),
}));
vi.mock('@/server/analysisPregen', () => ({
  runAnalysisPregen: vi.fn(async (o: { dryRun?: boolean }) => {
    h.runs.push(o);
    return { candidates: 0, selection: { sportmonksCalls: 0, sportmonksUpstream: 0 }, items: [], ms: 1 };
  }),
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import handler from '@/pages/api/admin/analysis-pregenerate';

function call(method: string, headers: Record<string, string> = {}, query: Record<string, string> = {}) {
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
    setHeader() {},
  };
  return Promise.resolve(handler({ method, headers, query } as unknown as NextApiRequest, res as unknown as NextApiResponse)).then(() => res);
}

describe('POST /api/admin/analysis-pregenerate', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'gizli';
    h.adminOk = false;
    h.runs = [];
  });

  it('CRON_SECRET ile çalışır; dryRun iletilir', async () => {
    const r = await call('POST', { authorization: 'Bearer gizli' }, { dryRun: '1' });
    expect(r.statusCode).toBe(200);
    expect(h.runs).toEqual([{ dryRun: true }]);
  });

  it('anahtar yoksa ve yönetici değilse çalışmaz', async () => {
    const r = await call('POST', { authorization: 'Bearer yanlis' });
    expect(r.statusCode).toBe(403);
    expect(h.runs).toEqual([]);
  });

  it('yalnız POST', async () => {
    expect((await call('GET', { authorization: 'Bearer gizli' })).statusCode).toBe(405);
  });
});
