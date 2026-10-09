import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma } from '@prisma/client';
import { dailySeed, todayKey, parseDayKey } from '@/lib/frikik/daily';
import { SIM_VERSION, scoreLevelRun } from '@/lib/frikik/sim';
import { finishedRun } from '@/test/frikik/runFixture';
import { parseScoreSubmission, verifyRun } from '@/lib/frikik/scoreSubmit';

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
    expect(h.created[0]).toMatchObject({ userId: 'u1', day, month: day.slice(0, 7), score: expected.total, level: expected.level, cleared: expected.cleared, simVersion: SIM_VERSION, seed: seed | 0, shots: shots.length });
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
    expect((await post({ ...good, seed: (seed ^ 1) >>> 0 })).body).toMatchObject({ code: 'BAD_SEED' });
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

/**
 * Tohum 32 bit işaretsiz; günlerin yaklaşık yarısında ≥ 2^31. `seed ^ 1` o günlerde negatif çıkıp gövde doğrulamasına
 * (BAD_BODY) takılıyordu → test güne bağlı kırılıyordu. Burada gün sabit: biri 2^31 altı, biri üstü tohumlu.
 */
describe('POST /api/frikik/score – sabit günler (tohum 2^31 altı / üstü)', () => {
  const CASES = [
    { day: '2026-10-08', high: false }, // 1045983627
    { day: '2026-10-09', high: true }, // 2147744602
  ];

  beforeEach(() => {
    h.userId = 'u1';
    h.username = 'eren';
    h.created = [];
    h.dupNext = false;
    h.rl = { success: true, remaining: 1, resetAt: 0 };
  });
  afterEach(() => void vi.useRealTimers());

  for (const { day: d, high } of CASES) {
    it(`${d} (tohum ${high ? '≥' : '<'} 2^31): geçerli koşu kaydedilir, yanlış tohum BAD_SEED`, async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${d}T09:00:00Z`)); // TR 12:00
      const s = dailySeed(parseDayKey(d)!);
      expect(s >= 2 ** 31).toBe(high);
      const run = finishedRun(s);
      const body = { day: d, seed: s, simVersion: SIM_VERSION, shots: run };
      const ok = await post(body);
      expect(ok.statusCode).toBe(200);
      expect(h.created[0]).toMatchObject({ day: d, seed: s | 0, score: scoreLevelRun(s, run).total });
      const wrong = (s ^ 1) >>> 0;
      expect(wrong).toBeGreaterThanOrEqual(0);
      const bad = await post({ ...body, seed: wrong });
      expect(bad.statusCode).toBe(400);
      expect(bad.body).toMatchObject({ code: 'BAD_SEED' });
      expect(h.created).toHaveLength(1);
    });
  }
});

describe('verifyRun: 2^31 üstü tohumla geçerli koşu', () => {
  // 2026-10-09 = 2147744602 (2^31'in hemen üstü), 2026-10-10 = 3804986645 (aralığın üst yarısı)
  for (const d of ['2026-10-09', '2026-10-10']) {
    it(`${d}: ayrıştırılır ve doğrulanır`, () => {
      const s = dailySeed(parseDayKey(d)!);
      expect(s).toBeGreaterThanOrEqual(2 ** 31);
      expect(s).toBeLessThanOrEqual(0xffffffff);
      const run = finishedRun(s);
      const sub = parseScoreSubmission({ day: d, seed: s, simVersion: SIM_VERSION, shots: run });
      expect(sub).not.toBeNull();
      const expected = scoreLevelRun(s, run);
      expect(verifyRun(sub!, Date.parse(`${d}T09:00:00Z`))).toEqual({
        ok: true, day: d, seed: s, level: expected.level, cleared: expected.cleared, score: expected.total, shots: run.length,
      });
    });
  }
});
