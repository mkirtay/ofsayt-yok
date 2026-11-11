import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ allowed: true, valid: true, cached: null as unknown, now: Date.parse('2026-11-12T15:00:00Z') }));
vi.mock('@/lib/requireComboAccess', () => ({
  requireComboAccess: vi.fn(async (_r: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => {
    if (h.allowed) return { ok: true, userId: 'a' };
    res.status(404).json({ error: 'Not found' });
    return { ok: false };
  }),
}));
vi.mock('@/lib/gundem/botAuth', () => ({ isValidCronRequest: () => h.valid }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $executeRawUnsafe: vi.fn(async () => 1) } }));
const build = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn(async () => undefined));
const read = vi.hoisted(() => vi.fn(async () => h.cached));
vi.mock('@/server/combo/dailyCoupons', async (orig) => ({ ...(await orig<typeof import('@/server/combo/dailyCoupons')>()), buildDailyCoupons: build, writeDaily: write, readDaily: read }));
vi.mock('@/server/combo/couponLog', () => ({ saveCouponLog: vi.fn(async () => ({ written: 0, skipped: 'no-table' })) }));
vi.mock('@/server/homeDay', () => ({ loadHomeDay: vi.fn() }));
vi.mock('@/server/combo/candidates', () => ({ loadComboCandidates: vi.fn() }));

import daily from '@/pages/api/combo/daily';
import cron from '@/pages/api/cron/combo-daily';

function call(handler: (q: NextApiRequest, s: NextApiResponse) => unknown, method: string, query: Record<string, string> = {}) {
  const res = {
    statusCode: 200, body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
  return Promise.resolve(handler({ method, query, headers: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse)).then(() => res);
}
const okPayload = { date: '2026-11-12', status: 'ok', coupons: [{}, {}, {}], analysed: 5 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  build.mockReset();
  write.mockClear();
  h.allowed = true; h.valid = true; h.cached = null;
});

describe('/api/combo/daily', () => {
  it('yetkisiz → kapıdan 404, hiçbir iş yok', async () => {
    h.allowed = false;
    expect((await call(daily, 'GET')).statusCode).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
  it('önbellek varsa ready; yoksa üretimde pending (HESAPLANMAZ)', async () => {
    vi.useFakeTimers({ now: h.now, toFake: ['Date'] });
    h.cached = okPayload;
    expect((await call(daily, 'GET', { date: '2026-11-12' })).body).toEqual({ state: 'ready', payload: okPayload });
    h.cached = null;
    vi.stubEnv('COMBO_TEST_ANALYSES_FILE', '/tmp/x.json');
    vi.stubEnv('NODE_ENV', 'production');
    const r = await call(daily, 'GET', { date: '2026-11-12' });
    expect(r.body).toMatchObject({ state: 'pending', at: '17:30' });
    expect(build).not.toHaveBeenCalled();
  });
  it('geliştirme + test dosyası: önbellek boşsa anında üretir ve yazar', async () => {
    vi.useFakeTimers({ now: h.now, toFake: ['Date'] });
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('COMBO_TEST_ANALYSES_FILE', '/tmp/x.json');
    build.mockResolvedValue(okPayload);
    const r = await call(daily, 'GET', { date: '2026-11-12' });
    expect(r.body).toEqual({ state: 'ready', payload: okPayload });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('bugün / yarın dışı tarih → 400; POST → 405', async () => {
    vi.useFakeTimers({ now: h.now, toFake: ['Date'] });
    expect((await call(daily, 'GET', { date: '2026-12-01' })).statusCode).toBe(400);
    expect((await call(daily, 'POST')).statusCode).toBe(405);
  });
});

describe('/api/cron/combo-daily', () => {
  it('bayrak kapalı → 404', async () => {
    expect((await call(cron, 'POST')).statusCode).toBe(404);
    expect(build).not.toHaveBeenCalled();
  });
  it('sır yok → 401; sır benzeri query → 400; GET → 405', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    h.valid = false;
    expect((await call(cron, 'POST')).statusCode).toBe(401);
    h.valid = true;
    expect((await call(cron, 'POST', { token: 'x' })).statusCode).toBe(400);
    expect((await call(cron, 'GET')).statusCode).toBe(405);
    expect(build).not.toHaveBeenCalled();
  });
  it('17:30 öncesi too-early; force ile aşılır', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    vi.useFakeTimers({ now: Date.parse('2026-11-12T10:00:00Z'), toFake: ['Date'] }); // 13:00 TR
    expect((await call(cron, 'POST')).body).toEqual({ ok: true, skipped: 'too-early' });
    build.mockResolvedValue({ ...okPayload, status: 'insufficient', coupons: [] });
    const r = await call(cron, 'POST', { force: '1' });
    expect((r.body as { summary: unknown[] }).summary).toHaveLength(2);
  });
  it('17:30 sonrası üretir + yazar + kayda geçirmeyi dener; o gün ok ise yeniden üretmez', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    vi.useFakeTimers({ now: Date.parse('2026-11-12T15:00:00Z'), toFake: ['Date'] }); // 18:00 TR
    build.mockResolvedValue(okPayload);
    const r1 = await call(cron, 'POST');
    expect(build).toHaveBeenCalledTimes(2); // bugün + yarın
    expect(write).toHaveBeenCalledTimes(2);
    expect((r1.body as { summary: Array<{ logged: unknown }> }).summary[0]!.logged).toBe('no-table');
    build.mockClear();
    h.cached = okPayload;
    const r2 = await call(cron, 'POST');
    expect(build).not.toHaveBeenCalled();
    expect((r2.body as { summary: Array<{ status: string }> }).summary.every((s) => s.status === 'already')).toBe(true);
  });
  it('COMBO_DAILY_TIME ayarlanabilir', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    vi.stubEnv('COMBO_DAILY_TIME', '12:00');
    vi.useFakeTimers({ now: Date.parse('2026-11-12T10:00:00Z'), toFake: ['Date'] }); // 13:00 TR
    build.mockResolvedValue(okPayload);
    const r = await call(cron, 'POST');
    expect((r.body as { summary?: unknown }).summary).toBeDefined();
  });
});
