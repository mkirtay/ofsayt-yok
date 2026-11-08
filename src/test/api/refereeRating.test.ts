import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Match } from '@/models/liveScore';
import { DELETED_USER_ID } from '@/config/deletedUser';

/**
 * /api/matches/{id}/referee-rating: giriş zorunlu, limit, 1–10 doğrulama, maç bitmiş + süre içinde; hakem kimliği ve maç
 * etiketi SUNUCUDA maçtan (istemcinin gönderdiği refereeId yok sayılır). DB ve Sportmonks taklit; ortalamanın gerçek SQL'i
 * PGlite testinde (src/test/migrations/refereeRating.pglite.test.ts).
 */
const NOW = Date.parse('2026-11-02T10:00:00Z');
const h = vi.hoisted(() => ({
  userId: 'u1' as string | null,
  rl: { success: true, remaining: 1, resetAt: 0 },
  match: null as Partial<Match> | null,
  transient: false,
  upserts: [] as Record<string, unknown>[],
  rows: new Map<string, number>(),
}));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => h.rl), requestIp: () => '1.1.1.1' }));
vi.mock('@/services/liveScoreService', () => ({
  findMatchById: vi.fn(async () => ({ match: h.match, events: [], fromFixture: false, ...(h.transient ? { transient: true } : {}) })),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    refereeRating: {
      findUnique: vi.fn(async ({ where }: { where: { userId_matchId: { userId: string; matchId: string } } }) => {
        const s = h.rows.get(`${where.userId_matchId.userId}:${where.userId_matchId.matchId}`);
        return s == null ? null : { score: s };
      }),
      upsert: vi.fn(async (args: { where: { userId_matchId: { userId: string; matchId: string } }; create: Record<string, unknown> }) => {
        h.upserts.push(args as never);
        h.rows.set(`${args.where.userId_matchId.userId}:${args.where.userId_matchId.matchId}`, args.create.score as number);
      }),
    },
    $queryRawUnsafe: vi.fn(async (_text: string, matchId: string, deleted: string) => {
      const scores = [...h.rows].filter(([k]) => k.endsWith(`:${matchId}`) && !k.startsWith(`${deleted}:`)).map(([, s]) => s);
      return [{ average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, count: scores.length }];
    }),
  },
}));

import handler from '@/pages/api/matches/[id]/referee-rating';

function call(method: string, body?: unknown, id = '19746609') {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
  };
  const req = { method, body, query: { id }, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

const FINISHED: Partial<Match> = {
  id: 19746609,
  status: 'FINISHED',
  date: '2026-11-01',
  scheduled: '18:00',
  referee_id: 62331,
  home: { id: 1, name: 'Galatasaray' } as Match['home'],
  away: { id: 2, name: 'Fenerbahçe' } as Match['away'],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.userId = 'u1';
  h.rl = { success: true, remaining: 1, resetAt: 0 };
  h.match = { ...FINISHED };
  h.transient = false;
  h.upserts = [];
  h.rows = new Map();
});

describe('POST /api/matches/{id}/referee-rating', () => {
  it('girişsiz → 401', async () => {
    h.userId = null;
    expect((await call('POST', { score: 7 })).statusCode).toBe(401);
    h.userId = DELETED_USER_ID;
    expect((await call('POST', { score: 7 })).statusCode).toBe(401);
    expect(h.upserts).toHaveLength(0);
  });

  it('limit aşımı → 429', async () => {
    h.rl = { success: false, remaining: 0, resetAt: 0 };
    expect((await call('POST', { score: 7 })).statusCode).toBe(429);
  });

  it('geçersiz puan → 400', async () => {
    for (const score of [0, 11, 6.5, '7']) expect((await call('POST', { score })).statusCode).toBe(400);
    expect(h.upserts).toHaveLength(0);
  });

  it('bozuk maç id → 400', async () => {
    expect((await call('POST', { score: 7 }, 'abc')).statusCode).toBe(400);
  });

  it('maç bitmedi → 409 NOT_FINISHED; süre doldu → 409 CLOSED; hakem yok → 409 NO_REFEREE', async () => {
    h.match = { ...FINISHED, status: '2nd Half' };
    expect(await call('POST', { score: 7 })).toMatchObject({ statusCode: 409, body: { code: 'NOT_FINISHED' } });
    h.match = { ...FINISHED, date: '2026-10-20' };
    expect(await call('POST', { score: 7 })).toMatchObject({ statusCode: 409, body: { code: 'CLOSED' } });
    h.match = { ...FINISHED, referee_id: undefined };
    expect(await call('POST', { score: 7 })).toMatchObject({ statusCode: 409, body: { code: 'NO_REFEREE' } });
    expect(h.upserts).toHaveLength(0);
  });

  it('maç yok → 404; geçici hata → 503', async () => {
    h.match = null;
    expect((await call('POST', { score: 7 })).statusCode).toBe(404);
    h.transient = true;
    expect((await call('POST', { score: 7 })).statusCode).toBe(503);
  });

  it('kaydeder: hakem kimliği ve etiket maçtan, istemcinin refereeId alanı yok sayılır; ortalama + kendi puanı döner', async () => {
    h.rows.set('u2:19746609', 4);
    const res = await call('POST', { score: 9, refereeId: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ average: 6.5, count: 2, userScore: 9 });
    expect(h.upserts[0]).toMatchObject({
      where: { userId_matchId: { userId: 'u1', matchId: '19746609' } },
      create: { userId: 'u1', matchId: '19746609', score: 9, refereeId: 62331, homeName: 'Galatasaray', awayName: 'Fenerbahçe', kickoffAt: new Date('2026-11-01T18:00:00Z') },
      update: { score: 9, refereeId: 62331 },
    });
  });

  it('ikinci gönderim aynı satırı günceller (tek oy)', async () => {
    await call('POST', { score: 9 });
    const res = await call('POST', { score: 3 });
    expect(res.body).toEqual({ average: 3, count: 1, userScore: 3 });
  });
});

describe('GET /api/matches/{id}/referee-rating', () => {
  it('ortalama + sayı + kendi puanı; önbelleğe alınmaz', async () => {
    h.rows.set('u1:19746609', 8);
    h.rows.set('u2:19746609', 5);
    h.rows.set(`${DELETED_USER_ID}:19746609`, 1);
    const res = await call('GET');
    expect(res.body).toEqual({ average: 6.5, count: 2, userScore: 8 });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('girişsiz: kendi puanı null', async () => {
    h.userId = null;
    expect((await call('GET')).body).toEqual({ average: null, count: 0, userScore: null });
  });

  it('başka yöntem → 405', async () => {
    expect((await call('DELETE')).statusCode).toBe(405);
  });
});
