import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { dailySeed, todayKey, parseDayKey } from '@/lib/frikik/daily';
import { SIM_VERSION, scoreLevelRun } from '@/lib/frikik/sim';
import { finishedRun } from '@/test/frikik/runFixture';

/** POST /api/frikik/score: sunucu skoru yeniden oynatır; istemci skoru asla kullanılmaz. DB ve Redis taklit. */
const h = vi.hoisted(() => ({
  userId: 'u1' as string | null,
  username: 'eren' as string | null,
  created: [] as Record<string, unknown>[],
  dupNext: false,
  rl: { success: true, remaining: 1, resetAt: 0 },
  warn: [] as string[],
}));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => h.rl), requestIp: () => '1.1.1.1' }));
vi.mock('@/lib/livescoreCache', () => ({ readCache: vi.fn(async () => null), writeCache: vi.fn(async () => {}) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => (h.userId ? { username: h.username } : null)) },
    frikikDailyScore: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (h.dupNext) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
        h.created.push(data);
        return { id: 'r1', ...data };
      }),
      findUnique: vi.fn(async () => {
        const c = h.created[0];
        return c ? { level: c.level, score: c.score, cleared: c.cleared, createdAt: new Date() } : null;
      }),
    },
    $queryRawUnsafe: vi.fn(async (text: string) => (text.startsWith('SELECT count') ? [{ n: 2 }] : [])),
  },
}));

import handler from '@/pages/api/frikik/score';

function post(body: unknown) {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end() { return this; },
  };
  const req = { method: 'POST', body, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

const day = todayKey(Date.now());
const seed = dailySeed(parseDayKey(day)!);
const shots = finishedRun(seed);
const good = { day, seed, simVersion: SIM_VERSION, shots };

describe('POST /api/frikik/score', () => {
  beforeEach(() => {
    h.userId = 'u1';
    h.username = 'eren';
    h.created = [];
    h.dupNext = false;
    h.rl = { success: true, remaining: 1, resetAt: 0 };
    vi.spyOn(console, 'warn').mockImplementation((m: unknown) => void h.warn.push(String(m)));
  });

  it('girişsiz 401; bozuk gövde 400', async () => {
    h.userId = null;
    expect((await post(good)).statusCode).toBe(401);
    h.userId = 'u1';
    const r = await post({ ...good, shots: 'x' });
    expect(r.statusCode).toBe(400);
    expect(r.body).toMatchObject({ code: 'BAD_BODY' });
    expect(h.created).toEqual([]);
  });

  it('manipüle edilmiş skor yok sayılır: kayıt sunucunun yeniden oynattığı sonuçtur', async () => {
    const r = await post({ ...good, score: 999_999, level: 77 });
    expect(r.statusCode).toBe(200);
    const expected = scoreLevelRun(seed, shots);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ userId: 'u1', day, month: day.slice(0, 7), score: expected.total, level: expected.level, cleared: expected.cleared, simVersion: SIM_VERSION, seed, shots: shots.length });
    expect(r.body).toMatchObject({ recorded: true, standing: { day, nickname: 'eren', today: { level: expected.level, score: expected.total, rank: 3 } } });
  });

  it('sürüm uyuşmazlığı 409 ve nedeni loglanır; kayıt yok', async () => {
    const r = await post({ ...good, simVersion: SIM_VERSION + 1 });
    expect(r.statusCode).toBe(409);
    expect(r.body).toMatchObject({ code: 'SIM_VERSION' });
    expect(h.warn.some((m) => m.includes(`client=${SIM_VERSION + 1} server=${SIM_VERSION}`))).toBe(true);
    expect(h.created).toEqual([]);
  });

  it('yanlış tohum / bitmemiş koşu 400', async () => {
    expect((await post({ ...good, seed: seed ^ 1 })).body).toMatchObject({ code: 'BAD_SEED' });
    expect((await post({ ...good, shots: shots.slice(0, 1) })).body).toMatchObject({ code: 'RUN_NOT_FINISHED' });
    expect(h.created).toEqual([]);
  });

  it('takma ad yoksa 403 NICKNAME_REQUIRED (kayıt yok)', async () => {
    h.username = null;
    const r = await post(good);
    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({ code: 'NICKNAME_REQUIRED' });
    expect(h.created).toEqual([]);
  });

  it('aynı gün ikinci gönderim: tekil anahtar → mevcut kayıt döner, recorded=false', async () => {
    await post(good);
    h.dupNext = true;
    const r = await post({ ...good, score: 1 });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ recorded: false });
    expect(h.created).toHaveLength(1);
  });

  it('hız sınırı 429 + Retry-After', async () => {
    h.rl = { success: false, remaining: 0, resetAt: Date.now() + 30_000 };
    const r = await post(good);
    expect(r.statusCode).toBe(429);
    expect(Number(r.headers['Retry-After'])).toBeGreaterThan(0);
  });
});
