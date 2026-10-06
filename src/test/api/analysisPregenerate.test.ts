import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ adminOk: false, runs: [] as Array<{ dryRun?: boolean } | undefined>, lockFree: true, ticks: 0, background: [] as Array<() => Promise<unknown>> }));
vi.mock('@/lib/requireAuth', () => ({
  requireAdmin: vi.fn(async (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => {
    if (h.adminOk) return { ok: true, userId: 'admin' };
    res.status(403).json({ error: 'yetkisiz' });
    return { ok: false };
  }),
}));
const result = { candidates: 1, selection: { sportmonksCalls: 1, sportmonksUpstream: 1 }, items: [{ matchId: 1, name: 'M', reason: 'super-lig', status: 'generated', sportmonksUpstream: 6 }], ms: 1 };
vi.mock('@/server/analysisPregen', async (orig) => ({
  summarizePregen: (await orig<typeof import('@/server/analysisPregen')>()).summarizePregen,
  runAnalysisPregen: vi.fn(async (o?: { dryRun?: boolean }) => {
    h.runs.push(o);
    return result;
  }),
}));
vi.mock('@/server/cronJobs', async (orig) => {
  const real = await orig<typeof import('@/server/cronJobs')>();
  return {
    isCronRequest: real.isCronRequest,
    acquireCronLock: vi.fn(async () => (h.lockFree ? { key: 'k', token: 't' } : null)),
    recordCronTick: vi.fn(async () => {
      h.ticks++;
      return { previous: null, at: 1 };
    }),
    runCronJob: vi.fn(async (_job: string, _trigger: string, work: () => Promise<unknown>) => {
      if (!h.lockFree) return { status: 'busy' };
      return { status: 'done', result: await work() };
    }),
  };
});
vi.mock('@/server/backgroundTask', () => ({ runInBackground: (task: () => Promise<unknown>) => h.background.push(task) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import pregen from '@/pages/api/admin/analysis-pregenerate';
import evaluate from '@/pages/api/admin/evaluate-predictions';
import { runCronJob } from '@/server/cronJobs';

vi.mock('@/lib/predictionRecords', () => ({ evaluatePendingPredictionRecords: vi.fn(async () => ({ evaluated: 2, skipped: 1, unresolved: 0, errors: 0 })) }));
vi.mock('@/lib/credits', () => ({ refundStalePendingSpends: vi.fn(async () => 0) }));

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

function call(handler: Handler, method: string, headers: Record<string, string> = {}, query: Record<string, string> = {}) {
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

const CRON = { authorization: 'Bearer gizli' };

describe('cron uçları — hızlı yanıt, çakışma, auth', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'gizli';
    h.adminOk = false;
    h.runs = [];
    h.lockFree = true;
    h.background = [];
    h.ticks = 0;
    vi.mocked(runCronJob).mockClear();
  });

  for (const [name, handler] of [['analysis-pregenerate', pregen as Handler], ['evaluate-predictions', evaluate as Handler]] as const) {
    it(`${name}: CRON_SECRET → hemen 202, iş arka planda; yanıtta secret yok`, async () => {
      const r = await call(handler, 'POST', CRON);
      expect(r.statusCode).toBe(202);
      expect(r.body).toEqual({ accepted: true, job: name });
      expect(h.background).toHaveLength(1);
      expect(h.ticks).toBe(1); // tick nabzı yanıttan önce, eşzamanlı
      expect(JSON.stringify(r.body)).not.toContain('gizli');
      await h.background[0]!();
      expect(runCronJob).toHaveBeenCalledWith(name, 'cron', expect.any(Function), expect.any(Function), { lock: { key: 'k', token: 't' }, ticked: { previous: null, at: 1 } });
    });

    it(`${name}: aynı anda ikinci çağrı 409 ALREADY_RUNNING`, async () => {
      h.lockFree = false;
      const r = await call(handler, 'POST', CRON);
      expect(r.statusCode).toBe(409);
      expect(r.body).toMatchObject({ code: 'ALREADY_RUNNING' });
      expect(h.background).toHaveLength(0);
    });

    it(`${name}: yetkisiz → 403, iş başlamaz`, async () => {
      const r = await call(handler, 'POST', { authorization: 'Bearer yanlis' });
      expect(r.statusCode).toBe(403);
      expect(h.background).toHaveLength(0);
      expect(runCronJob).not.toHaveBeenCalled();
    });
  }

  it('yönetici elle: değerlendirme senkron, sonuç mesajı için alanlar yanıtta', async () => {
    h.adminOk = true;
    const r = await call(evaluate as Handler, 'POST');
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ evaluated: 2, skipped: 1, unresolved: 0, errors: 0, staleCreditRefunds: 0 });
    expect(h.background).toHaveLength(0);
  });

  it('yönetici elle ön üretim senkron; dryRun her zaman senkron ve kilitsiz', async () => {
    h.adminOk = true;
    expect((await call(pregen as Handler, 'POST')).statusCode).toBe(200);
    const dry = await call(pregen as Handler, 'POST', CRON, { dryRun: '1' });
    expect(dry.statusCode).toBe(200);
    expect(h.runs.at(-1)).toEqual({ dryRun: true });
    expect(h.background).toHaveLength(0);
  });

  it('Vercel cron (GET + Bearer) değerlendirmede de 202; GET yetkisiz 405', async () => {
    expect((await call(evaluate as Handler, 'GET', CRON)).statusCode).toBe(202);
    expect((await call(evaluate as Handler, 'GET')).statusCode).toBe(405);
    expect((await call(pregen as Handler, 'GET', CRON)).statusCode).toBe(405);
  });
});
