import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** /api/mini-saha/progress: giriş şart, maç özeti kurallarla işlenir, bozuk gövde 400, misafir ilerlemesi birleşir. */
const h = vi.hoisted(() => ({
  userId: 'u1' as string | null,
  row: null as { matches: number; wins: number; unlocked: string[] } | null,
  rl: { success: true, remaining: 1, resetAt: 0 },
}));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => h.rl), requestIp: () => '1.1.1.1' }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn(), captureWarning: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    miniSahaProgress: {
      findUnique: vi.fn(async () => h.row),
      upsert: vi.fn(async ({ create, update }: { create: typeof h.row; update: typeof h.row }) => {
        h.row = h.row ? { ...h.row, ...update! } : { ...create! };
        return h.row;
      }),
    },
  },
}));

import handler from '@/pages/api/mini-saha/progress';

function call(method: 'GET' | 'POST', body?: unknown) {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end() { return this; },
  };
  const req = { method, body, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

beforeEach(() => {
  h.userId = 'u1';
  h.row = null;
  h.rl = { success: true, remaining: 1, resetAt: 0 };
});

describe('/api/mini-saha/progress', () => {
  it('girişsiz 401', async () => {
    h.userId = null;
    expect((await call('GET')).statusCode).toBe(401);
  });

  it('GET: kayıt yoksa yalnız Dengeli açık', async () => {
    const r = await call('GET');
    expect(r.body).toEqual({ progress: { matches: 0, wins: 0, unlocked: ['dengeli'] } });
  });

  it('POST summary: 3 gollü maç Rüzgâr’ı açar ve kaydedilir', async () => {
    const r = await call('POST', { summary: { mode: '1v1', diff: 'kolay', goalsFor: 3, goalsAgainst: 1 } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ newlyUnlocked: ['ruzgar'], progress: { matches: 1, wins: 1 } });
    expect(h.row?.unlocked).toEqual(['dengeli', 'ruzgar']);
  });

  it('POST: bozuk özet 400, kayıt değişmez', async () => {
    const r = await call('POST', { summary: { mode: '1v1', diff: 'efsane', goalsFor: 3, goalsAgainst: 1 } });
    expect(r.statusCode).toBe(400);
    expect(h.row).toBeNull();
  });

  it('POST merge: misafir ilerlemesi birleşir, bilinmeyen id atılır', async () => {
    h.row = { matches: 4, wins: 1, unlocked: ['dengeli', 'ruzgar'] };
    const r = await call('POST', { merge: { matches: 2, wins: 2, unlocked: ['bomba', 'hile'] } });
    expect(r.body).toEqual({ progress: { matches: 4, wins: 2, unlocked: ['dengeli', 'ruzgar', 'bomba'] } });
  });

  it('hız sınırı 429', async () => {
    h.rl = { success: false, remaining: 0, resetAt: Date.now() + 30_000 };
    const r = await call('POST', { summary: { mode: '1v1', diff: 'kolay', goalsFor: 1, goalsAgainst: 0 } });
    expect(r.statusCode).toBe(429);
  });
});
