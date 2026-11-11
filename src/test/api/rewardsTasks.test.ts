import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** GET/POST /api/rewards/tasks — oturum şartı, görev doğrulaması, hata kodu → HTTP durumu. Sunucu modülü taklit. */
const h = vi.hoisted(() => ({ userId: null as string | null, claim: vi.fn(), load: vi.fn() }));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/server/rewards', () => ({ claimOnboardingTask: h.claim, loadOnboardingTasks: h.load }));

import handler from '@/pages/api/rewards/tasks';

function call(method: string, body?: unknown) {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end() { return this; },
  };
  const req = { method, body, query: {}, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

describe('/api/rewards/tasks', () => {
  beforeEach(() => {
    h.userId = 'u1';
    h.claim.mockReset();
    h.load.mockReset();
  });

  it('girişsiz 401; GET durumu döner, önbelleksiz', async () => {
    h.userId = null;
    expect((await call('GET')).statusCode).toBe(401);
    h.userId = 'u1';
    h.load.mockResolvedValue({ verified: true, tasks: [] });
    const r = await call('GET');
    expect(r.statusCode).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(h.load).toHaveBeenCalledWith('u1');
  });

  it('POST: bilinmeyen görev 400; başarı bakiye döner; hata kodları', async () => {
    expect((await call('POST', { task: 'hack' })).statusCode).toBe(400);
    expect(h.claim).not.toHaveBeenCalled();
    h.claim.mockResolvedValueOnce({ ok: true, balance: 3 });
    expect((await call('POST', { task: 'frikik' })).body).toEqual({ ok: true, credits: 3 });
    h.claim.mockResolvedValueOnce({ ok: false, code: 'ALREADY_CLAIMED' });
    expect((await call('POST', { task: 'frikik' })).statusCode).toBe(409);
    h.claim.mockResolvedValueOnce({ ok: false, code: 'UNVERIFIED' });
    expect((await call('POST', { task: 'analysis' })).statusCode).toBe(403);
    h.claim.mockResolvedValueOnce({ ok: false, code: 'NOT_DONE' });
    expect((await call('POST', { task: 'gundem' })).statusCode).toBe(400);
    expect((await call('DELETE')).statusCode).toBe(405);
  });
});
